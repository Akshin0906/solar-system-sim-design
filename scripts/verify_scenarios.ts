import assert from "node:assert/strict";
import { bodies, bodiesById } from "../src/data";
import { AU_KM, DAY_SECONDS } from "../src/data/constants";
import {
  DEFAULT_FRAGMENT_CAP,
  FIXED_STEP_SECONDS,
  addSimBody,
  contactOutcome,
  enableDebris,
  resolveContact,
  seedIntegrator,
  stepFixed,
  tidalDisrupt,
} from "../src/scenarios/integrator";
import { IMPACTOR_ID, INTERLOPER_ID, scenarioById } from "../src/scenarios/registry";
import type { Vec3 } from "../src/simulation/orbitalElements";
import type { IntegratorState, SimBody } from "../src/scenarios/types";

const J2000_MS = Date.parse("2000-01-01T12:00:00.000Z");
const SUN_MU = 132_712_440_018;

const magnitude = ([x, y, z]: Vec3) => Math.hypot(x, y, z);
const hasNaN = ([x, y, z]: Vec3) => Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z);

// Conserved quantity = G * total mechanical energy (the common G factor cancels the
// mu→mass conversion). For a symplectic leapfrog over well-separated bodies this should
// hold to a fraction of a percent — the sharpest test that seeding (position + velocity)
// is physically consistent.
const energyProxy = (state: IntegratorState) => {
  const live = state.bodies.filter((b) => b.alive);
  let kinetic = 0;
  for (const b of live) {
    kinetic += 0.5 * b.muKm3S2 * (b.velKmS[0] ** 2 + b.velKmS[1] ** 2 + b.velKmS[2] ** 2);
  }
  let potential = 0;
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const dx = live[j].posKm[0] - live[i].posKm[0];
      const dy = live[j].posKm[1] - live[i].posKm[1];
      const dz = live[j].posKm[2] - live[i].posKm[2];
      potential -= (live[i].muKm3S2 * live[j].muKm3S2) / Math.hypot(dx, dy, dz);
    }
  }
  return kinetic + potential;
};

const totalMomentum = (state: IntegratorState): Vec3 => {
  const p: Vec3 = [0, 0, 0];
  for (const b of state.bodies) {
    if (!b.alive) continue;
    p[0] += b.muKm3S2 * b.velKmS[0];
    p[1] += b.muKm3S2 * b.velKmS[1];
    p[2] += b.muKm3S2 * b.velKmS[2];
  }
  return p;
};

const stepFor = (state: IntegratorState, simSeconds: number) => {
  const steps = Math.round(simSeconds / FIXED_STEP_SECONDS);
  for (let i = 0; i < steps; i += 1) {
    stepFixed(state, FIXED_STEP_SECONDS);
  }
};

const problems: string[] = [];
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    problems.push(`${name}: ${(error as Error).message}`);
    console.log(`  FAIL ${name}`);
  }
};

// --- 1. Seed shape -----------------------------------------------------------
check("seed yields Sun + 8 planets as participants", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  assert.equal(state.participantIds.size, 9, "expected 9 participants");
  assert.ok(state.participantIds.has("sun"));
  assert.ok(state.participantIds.has("earth"));
  for (const sb of state.bodies) {
    assert.ok(!hasNaN(sb.posKm) && !hasNaN(sb.velKmS), `${sb.id} seeded with NaN`);
  }
  // Earth's seeded speed must be ~its real orbital speed (~29.8 km/s).
  const earth = state.byId.get("earth")!;
  const speed = magnitude(earth.velKmS);
  assert.ok(speed > 28 && speed < 31, `Earth seed speed ${speed.toFixed(2)} km/s out of range`);
});

// --- 2. Oracle: orbits stay bound + energy conserved over 3 years ------------
check("freefall keeps orbits bound and conserves energy (3 yr)", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const e0 = energyProxy(state);
  const earthR: number[] = [];
  const jupiterR: number[] = [];
  const totalSteps = Math.round((3 * 365.256 * DAY_SECONDS) / FIXED_STEP_SECONDS);
  for (let i = 0; i < totalSteps; i += 1) {
    stepFixed(state, FIXED_STEP_SECONDS);
    if (i % 200 === 0) {
      earthR.push(magnitude(state.byId.get("earth")!.posKm) / AU_KM);
      jupiterR.push(magnitude(state.byId.get("jupiter")!.posKm) / AU_KM);
    }
  }
  for (const sb of state.bodies) {
    assert.ok(!hasNaN(sb.posKm), `${sb.id} went NaN`);
  }
  // Earth e=0.0167 ⇒ 0.983–1.017 AU; allow margin for barycentric wobble.
  assert.ok(Math.min(...earthR) > 0.95 && Math.max(...earthR) < 1.06, `Earth radius drifted to [${Math.min(...earthR).toFixed(3)}, ${Math.max(...earthR).toFixed(3)}] AU`);
  // Jupiter e=0.048 ⇒ ~4.95–5.46 AU.
  assert.ok(Math.min(...jupiterR) > 4.85 && Math.max(...jupiterR) < 5.55, `Jupiter radius drifted to [${Math.min(...jupiterR).toFixed(2)}, ${Math.max(...jupiterR).toFixed(2)}] AU`);
  const drift = Math.abs((energyProxy(state) - e0) / e0);
  assert.ok(drift < 0.01, `energy drift ${(drift * 100).toFixed(3)}% exceeds 1%`);
});

// --- 3. Determinism ----------------------------------------------------------
check("integration is deterministic (identical runs match exactly)", () => {
  const run = () => {
    const state = seedIntegrator(bodies, bodiesById, J2000_MS);
    stepFor(state, 400 * DAY_SECONDS);
    return state.byId.get("mars")!.posKm;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two identical runs diverged");
});

// --- 4. Collision: heavy rogue consumes the Sun ------------------------------
check("rogue heavier than the Sun consumes it (momentum + mass conserved)", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const rogueMu = 2 * SUN_MU;
  addSimBody(state, {
    id: "rogue-test",
    kind: "rogue",
    posKm: [1_500_000, 0, 0],
    velKmS: [-30, 0, 0],
    muKm3S2: rogueMu,
    radiusKm: 60_000,
    color: "#fff",
    alive: true,
  });
  const muBefore = state.byId.get("sun")!.muKm3S2 + rogueMu;
  const pBefore = totalMomentum(state);
  stepFor(state, 200 * FIXED_STEP_SECONDS);
  const sun = state.byId.get("sun")!;
  const rogue = state.byId.get("rogue-test")!;
  assert.equal(sun.alive, false, "Sun should be consumed by the heavier rogue");
  assert.equal(rogue.alive, true, "rogue should survive");
  assert.ok(state.newlyConsumed.includes("sun"), "consumed list must report the Sun");
  assert.ok(Math.abs(rogue.muKm3S2 - muBefore) / muBefore < 1e-9, "merged mass not conserved");
  const pAfter = totalMomentum(state);
  const pErr = magnitude([pAfter[0] - pBefore[0], pAfter[1] - pBefore[1], pAfter[2] - pBefore[2]]) / magnitude(pBefore);
  assert.ok(pErr < 1e-6, `momentum not conserved across merge (err ${pErr.toExponential(2)})`);
});

// --- 5. Collision: light rogue is absorbed, Sun survives ---------------------
check("rogue lighter than the Sun is absorbed; no planet reported consumed", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  addSimBody(state, {
    id: "rogue-test",
    kind: "rogue",
    posKm: [1_500_000, 0, 0],
    velKmS: [-30, 0, 0],
    muKm3S2: 0.4 * SUN_MU,
    radiusKm: 60_000,
    color: "#fff",
    alive: true,
  });
  stepFor(state, 200 * FIXED_STEP_SECONDS);
  const sun = state.byId.get("sun")!;
  const rogue = state.byId.get("rogue-test")!;
  assert.equal(sun.alive, true, "Sun should survive a lighter rogue");
  assert.equal(rogue.alive, false, "lighter rogue should be absorbed");
  // The rogue has no sourceId, so nothing is added to the consumed (data-body) list.
  assert.equal(state.newlyConsumed.length, 0, "a consumed rogue must not appear in the destroyed-planet list");
});

// --- 6. Red giant: swell engulfs inner planets in radial order --------------
check("red giant swells and engulfs the inner planets in radial order", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const scenario = scenarioById.get("red-giant");
  assert.ok(scenario?.drive, "red-giant scenario must define a drive() hook");
  const params = { swellYears: 2, finalRadiusAu: 1.1 };
  const firstConsumedAt: Record<string, number> = {};
  const totalSteps = Math.round((2.2 * 365.256 * DAY_SECONDS) / FIXED_STEP_SECONDS);
  for (let i = 0; i < totalSteps; i += 1) {
    scenario!.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
    stepFixed(state, FIXED_STEP_SECONDS);
    for (const id of state.newlyConsumed) {
      if (firstConsumedAt[id] === undefined) firstConsumedAt[id] = i;
    }
  }
  assert.equal(state.byId.get("sun")!.alive, true, "Sun survives as the giant");
  for (const id of ["mercury", "venus", "earth"]) {
    assert.ok(firstConsumedAt[id] !== undefined, `${id} should be engulfed`);
  }
  assert.ok(firstConsumedAt.mercury < firstConsumedAt.venus, "Mercury engulfed before Venus");
  assert.ok(firstConsumedAt.venus < firstConsumedAt.earth, "Venus engulfed before Earth");
  // Mars (1.52 AU) is beyond the 1.1 AU final radius and must be spared.
  assert.equal(firstConsumedAt.mars, undefined, "Mars must survive a 1.1 AU giant");
  const finalKm = 1.1 * AU_KM;
  assert.ok(Math.abs(state.byId.get("sun")!.radiusKm - finalKm) / finalKm < 0.02, "Sun reached its final radius");
});

// --- Debris helpers ----------------------------------------------------------
// An isolated integrator state (no Sun/planets) carrying only the bodies a test injects,
// so collision conservation can be measured without the rest of the system in the sum.
const bareDebrisState = (cap = DEFAULT_FRAGMENT_CAP): IntegratorState => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  state.bodies = [];
  state.byId.clear();
  state.participantIds.clear();
  enableDebris(state, cap);
  return state;
};

const EARTH_MU = 398_600.435;
const EARTH_R = 6_371;
const blob = (id: string, posKm: Vec3, velKmS: Vec3, muKm3S2 = EARTH_MU, radiusKm = EARTH_R): SimBody => ({
  id,
  kind: "rogue",
  posKm,
  velKmS,
  muKm3S2,
  radiusKm,
  color: "#ffffff",
  alive: true,
});
const fragMass = (state: IntegratorState) =>
  state.bodies.filter((b) => b.alive && b.kind === "fragment").reduce((s, b) => s + b.muKm3S2, 0);
const fragCount = (state: IntegratorState) =>
  state.bodies.filter((b) => b.alive && b.kind === "fragment").length;
const momentumErr = (after: Vec3, before: Vec3) =>
  magnitude([after[0] - before[0], after[1] - before[1], after[2] - before[2]]) / magnitude(before);

// --- 7. Shatter: high-speed comparable hit → conserving, capped debris cloud --
check("high-speed comparable impact shatters, conserving mass/volume/momentum", () => {
  const a = blob("blob-a", [0, 0, 0], [40, 0, 0]);
  const b = blob("blob-b", [EARTH_R * 2, 0, 0], [-10, 0, 0]); // rel speed 50 km/s ≫ escape
  const state = bareDebrisState();
  addSimBody(state, a);
  addSimBody(state, b);
  assert.equal(contactOutcome(a, b), "shatter", "50 km/s closing must classify as shatter");
  const muSum = a.muKm3S2 + b.muKm3S2;
  const volSum = a.radiusKm ** 3 + b.radiusKm ** 3;
  const pBefore = totalMomentum(state);
  resolveContact(state, a, b);
  assert.equal(a.alive, false, "both parents consumed");
  assert.equal(b.alive, false, "both parents consumed");
  assert.ok(fragCount(state) >= 2, `expected a debris cloud, got ${fragCount(state)}`);
  assert.ok(Math.abs(fragMass(state) - muSum) / muSum < 1e-9, "fragment mass not conserved");
  const volFrag = state.bodies.filter((x) => x.alive && x.kind === "fragment").reduce((s, x) => s + x.radiusKm ** 3, 0);
  assert.ok(Math.abs(volFrag - volSum) / volSum < 1e-9, "fragment volume not conserved");
  const pErr = momentumErr(totalMomentum(state), pBefore);
  assert.ok(pErr < 1e-9, `shatter momentum error ${pErr.toExponential(2)}`);
});

// --- 8. Speed decides outcome: slow merges, fast shatters --------------------
check("a slow comparable contact merges cleanly while a fast one shatters", () => {
  const slowA = blob("slow-a", [0, 0, 0], [3, 0, 0]);
  const slowB = blob("slow-b", [EARTH_R * 2, 0, 0], [-2, 0, 0]); // rel 5 km/s < graze
  assert.equal(contactOutcome(slowA, slowB), "merge", "5 km/s must be a clean merge");
  const slow = bareDebrisState();
  addSimBody(slow, slowA);
  addSimBody(slow, slowB);
  resolveContact(slow, slowA, slowB);
  assert.equal(fragCount(slow), 0, "a gentle merge sheds no debris");
  assert.equal(slow.bodies.filter((x) => x.alive).length, 1, "two bodies merge into one");

  const fastA = blob("fast-a", [0, 0, 0], [40, 0, 0]);
  const fastB = blob("fast-b", [EARTH_R * 2, 0, 0], [-10, 0, 0]);
  const fast = bareDebrisState();
  addSimBody(fast, fastA);
  addSimBody(fast, fastB);
  resolveContact(fast, fastA, fastB);
  assert.ok(fragCount(fast) >= 2, "a hypervelocity hit shatters into fragments");
});

// --- 9. Giant-impact regime: intermediate speed sheds a re-accreting ring ----
check("intermediate-speed impact merges into a remnant plus a conserving ring", () => {
  const a = blob("ring-a", [0, 0, 0], [8, 0, 0]);
  const b = blob("ring-b", [EARTH_R * 2, 0, 0], [-4, 0, 0]); // rel 12 km/s ~ escape (11.2)
  assert.equal(contactOutcome(a, b), "ring", "~12 km/s must be a giant-impact ring");
  const state = bareDebrisState();
  addSimBody(state, a);
  addSimBody(state, b);
  const muSum = a.muKm3S2 + b.muKm3S2;
  const pBefore = totalMomentum(state);
  resolveContact(state, a, b);
  const remnants = state.bodies.filter((x) => x.alive && x.kind !== "fragment");
  assert.equal(remnants.length, 1, "the bodies coalesce into a single molten remnant");
  assert.ok(fragCount(state) >= 2, "the giant impact sheds a debris ring");
  const muAll = state.bodies.filter((x) => x.alive).reduce((s, x) => s + x.muKm3S2, 0);
  assert.ok(Math.abs(muAll - muSum) / muSum < 1e-9, "remnant + ring mass not conserved");
  const pErr = momentumErr(totalMomentum(state), pBefore);
  assert.ok(pErr < 1e-9, `ring momentum error ${pErr.toExponential(2)}`);
});

// --- 10. Fragment cap is enforced and surfaced, never silently dropped -------
check("fragment cap bounds the cloud and is recorded for the panel", () => {
  const a = blob("cap-a", [0, 0, 0], [40, 0, 0]);
  const b = blob("cap-b", [EARTH_R * 2, 0, 0], [-10, 0, 0]);
  const state = bareDebrisState(8); // cap below what this energetic hit wants
  addSimBody(state, a);
  addSimBody(state, b);
  const muSum = a.muKm3S2 + b.muKm3S2;
  resolveContact(state, a, b);
  assert.ok(fragCount(state) <= 8, `cap 8 exceeded: ${fragCount(state)} fragments`);
  assert.equal(state.fragmentCapHit, 8, "the enforced cap must be recorded, never silent");
  assert.ok(Math.abs(fragMass(state) - muSum) / muSum < 1e-9, "mass conserved despite coalescing to the cap");
});

// --- 11. Tidal disruption streams a body, conserving mass + momentum ---------
check("tidal disruption streams a body into conserving, capped debris", () => {
  const state = bareDebrisState(12);
  const victim = blob("victim", [1e8, 0, 0], [0, 30, 0]);
  victim.kind = "body";
  victim.sourceId = "earth";
  addSimBody(state, victim);
  const muBefore = victim.muKm3S2;
  const pBefore = totalMomentum(state);
  const disrupted = tidalDisrupt(state, victim, [1, 0, 0]);
  assert.ok(disrupted, "tidal disruption should fire on a massive body");
  assert.equal(victim.alive, false, "the body is gone, replaced by a stream");
  assert.ok(state.newlyConsumed.includes("earth"), "the consumed list must report the disrupted body");
  assert.ok(fragCount(state) >= 2 && fragCount(state) <= 12, `stream size ${fragCount(state)} out of [2,12]`);
  assert.ok(Math.abs(fragMass(state) - muBefore) / muBefore < 1e-9, "tidal stream mass not conserved");
  const pErr = momentumErr(totalMomentum(state), pBefore);
  assert.ok(pErr < 1e-9, `tidal momentum error ${pErr.toExponential(2)}`);
});

// --- 12. Debris integrates stably: fragments gravitate without NaN/blowup ----
check("debris integrates stably and does not all instantly re-accrete", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  enableDebris(state, DEFAULT_FRAGMENT_CAP);
  const a = blob("x", [3 * AU_KM, 0, 0], [40, 17, 0]);
  const b = blob("y", [3 * AU_KM + EARTH_R * 2, 0, 0], [-10, 17, 0]); // rel 50 km/s → shatter
  addSimBody(state, a);
  addSimBody(state, b);
  resolveContact(state, a, b);
  const born = fragCount(state);
  assert.ok(born >= 2, `expected a debris cloud, got ${born}`);
  for (let i = 0; i < 300; i += 1) {
    stepFixed(state, FIXED_STEP_SECONDS);
  }
  for (const sb of state.bodies) {
    assert.ok(!hasNaN(sb.posKm) && !hasNaN(sb.velKmS), `${sb.id} went NaN`);
  }
  assert.ok(fragCount(state) >= 2, `debris must survive, not instantly re-merge (got ${fragCount(state)})`);
});

// --- 13. Rogue black hole: tidal disruption inside the Roche limit -----------
check("rogue black hole tidally disrupts a planet that crosses its Roche limit", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const scenario = scenarioById.get("rogue-blackhole");
  assert.ok(scenario?.seed && scenario?.drive, "rogue-blackhole needs a seed + drive");
  const params = { interloperType: 0, massMult: 1, speedKmS: 45, missDistanceAu: 0.5, fragmentCap: 40 };
  scenario!.seed!({ state, params, bodiesById });
  const hole = state.byId.get(INTERLOPER_ID);
  assert.ok(hole, "the interloper must be injected");
  const earth = state.byId.get("earth")!;
  // Park Earth just inside its Roche limit of the hole (but outside the capture radius).
  const roche = earth.radiusKm * Math.cbrt((2 * hole!.muKm3S2) / earth.muKm3S2);
  assert.ok(roche * 0.5 > hole!.radiusKm, "test placement must sit outside the capture radius");
  earth.posKm = [hole!.posKm[0] + roche * 0.5, hole!.posKm[1], hole!.posKm[2]];
  const pBefore = totalMomentum(state);
  scenario!.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
  assert.equal(earth.alive, false, "a planet inside the Roche limit must be tidally disrupted");
  assert.ok(state.newlyConsumed.includes("earth"), "the disrupted planet is reported consumed");
  assert.ok(fragCount(state) >= 2, `a tidal stream is expected, got ${fragCount(state)}`);
  const pErr = momentumErr(totalMomentum(state), pBefore);
  assert.ok(pErr < 1e-9, `tidal disruption momentum error ${pErr.toExponential(2)}`);
});

// --- 14. Rogue black hole: a full pass is deterministic and stays finite -----
check("rogue black hole pass is deterministic and never goes NaN", () => {
  const run = () => {
    const state = seedIntegrator(bodies, bodiesById, J2000_MS);
    const scenario = scenarioById.get("rogue-blackhole")!;
    const params = { interloperType: 0, massMult: 1.5, speedKmS: 90, missDistanceAu: 0.3, fragmentCap: 40 };
    scenario.seed!({ state, params, bodiesById });
    const steps = Math.round((4 * 365.256 * DAY_SECONDS) / FIXED_STEP_SECONDS);
    for (let i = 0; i < steps; i += 1) {
      scenario.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
      stepFixed(state, FIXED_STEP_SECONDS);
    }
    return state;
  };
  const a = run();
  for (const sb of a.bodies) {
    assert.ok(!hasNaN(sb.posKm) && !hasNaN(sb.velKmS), `${sb.id} went NaN during the pass`);
  }
  const holeA = a.byId.get(INTERLOPER_ID)!;
  assert.equal(holeA.alive, true, "the black hole survives the pass");
  const b = run();
  assert.deepEqual(holeA.posKm, b.byId.get(INTERLOPER_ID)!.posKm, "two identical black-hole runs diverged");
});

// --- 15. Impact: a small fast impactor craters a planet (survives) + ejecta --
check("a small fast impactor craters a planet, conserving mass/momentum with ejecta", () => {
  const planet = blob("planet", [0, 0, 0], [0, 30, 0]);
  const impactor = blob("impactor", [EARTH_R * 1.5, 0, 0], [-40, 30, 0], EARTH_MU * 0.0005, 80); // rel 40 km/s
  const state = bareDebrisState();
  addSimBody(state, planet);
  addSimBody(state, impactor);
  assert.equal(contactOutcome(planet, impactor), "crater", "a small fast hit must crater, not shatter");
  const muSum = planet.muKm3S2 + impactor.muKm3S2;
  const pBefore = totalMomentum(state);
  resolveContact(state, planet, impactor);
  assert.equal(planet.alive, true, "the planet survives a small impact");
  assert.equal(impactor.alive, false, "the impactor is absorbed");
  assert.ok(fragCount(state) >= 2, `ejecta expected, got ${fragCount(state)}`);
  assert.ok(state.impactFx.length >= 2, "an impact flash + shockwave must be queued for VFX");
  const muAll = state.bodies.filter((b) => b.alive).reduce((s, b) => s + b.muKm3S2, 0);
  assert.ok(Math.abs(muAll - muSum) / muSum < 1e-9, "crater mass not conserved");
  const pErr = momentumErr(totalMomentum(state), pBefore);
  assert.ok(pErr < 1e-9, `crater momentum error ${pErr.toExponential(2)}`);
});

// --- 16. Impact: a large comparable impactor shatters the planet -------------
check("a large hypervelocity impactor shatters the target planet", () => {
  const planet = blob("planet", [0, 0, 0], [0, 30, 0]);
  const big = blob("big", [EARTH_R * 1.5, 0, 0], [-40, 30, 0], EARTH_MU * 0.5, EARTH_R * 0.6);
  const state = bareDebrisState();
  addSimBody(state, planet);
  addSimBody(state, big);
  assert.equal(contactOutcome(planet, big), "shatter", "a comparable hypervelocity hit must shatter");
  resolveContact(state, planet, big);
  assert.equal(planet.alive, false, "the planet is fractured");
  assert.ok(fragCount(state) >= 2, "a debris cloud is produced");
});

// --- 17. Impact scenario reliably lands its strike --------------------------
check("impact scenario steers the impactor to a reliable strike on its target", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const scenario = scenarioById.get("impact");
  assert.ok(scenario?.seed && scenario?.drive, "impact needs a seed + drive");
  const params = { target: 2, impactorType: 0, sizeKm: 60, speedKmS: 28, impactAngleDeg: 45 };
  scenario!.seed!({ state, params, bodiesById });
  assert.ok(state.byId.get(IMPACTOR_ID), "the impactor must be injected");
  let struck = false;
  const steps = Math.round((90 * DAY_SECONDS) / FIXED_STEP_SECONDS);
  for (let i = 0; i < steps && !struck; i += 1) {
    scenario!.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
    stepFixed(state, FIXED_STEP_SECONDS);
    if (!state.byId.get(IMPACTOR_ID)!.alive) {
      struck = true;
    }
  }
  assert.ok(struck, "the impactor should strike Earth within 90 days");
  assert.equal(state.byId.get("earth")!.alive, true, "Earth survives a 60 km impactor (cratered, not shattered)");
  assert.ok(fragCount(state) >= 1, "the strike throws ejecta");
  assert.ok(state.impactFx.length >= 2, "the strike queues impact VFX");
});

// --- 18. Collision: a low-speed giant impact → molten remnant + debris ring --
check("collision scenario merges worlds into a molten remnant with a re-accreting ring", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const scenario = scenarioById.get("collision");
  assert.ok(scenario?.seed && scenario?.drive, "collision needs a seed + drive");
  const params = { mover: 3, target: 2, approachSpeedKmS: 9, fragmentCap: 40 }; // Mars → Earth, slow
  scenario!.seed!({ state, params, bodiesById });
  let collided = false;
  const steps = Math.round((400 * DAY_SECONDS) / FIXED_STEP_SECONDS);
  for (let i = 0; i < steps && !collided; i += 1) {
    scenario!.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
    stepFixed(state, FIXED_STEP_SECONDS);
    if (!state.byId.get("mars")!.alive) {
      collided = true;
    }
  }
  assert.ok(collided, "Mars should reach Earth within 400 days");
  const earth = state.byId.get("earth")!;
  assert.equal(earth.alive, true, "Earth survives as the merged remnant");
  assert.ok((earth.moltenHeat ?? 0) > 0.5, "the remnant is freshly molten");
  assert.ok(fragCount(state) >= 2, "a giant-impact debris ring is shed");
  // The remnant cools over sim-time but is still glowing shortly after.
  const heatAtImpact = earth.moltenHeat ?? 0;
  for (let i = 0; i < 2000; i += 1) {
    stepFixed(state, FIXED_STEP_SECONDS);
  }
  const heatLater = state.byId.get("earth")!.moltenHeat ?? 0;
  assert.ok(heatLater < heatAtImpact && heatLater > 0, `remnant should cool (was ${heatAtImpact.toFixed(2)}, now ${heatLater.toFixed(2)})`);
});

// --- 19. Collision: a high-speed smash shatters both worlds ------------------
check("collision scenario shatters both worlds at high closing speed", () => {
  const state = seedIntegrator(bodies, bodiesById, J2000_MS);
  const scenario = scenarioById.get("collision")!;
  const params = { mover: 1, target: 2, approachSpeedKmS: 32, fragmentCap: 40 }; // Venus → Earth, fast
  scenario.seed!({ state, params, bodiesById });
  let shattered = false;
  const steps = Math.round((400 * DAY_SECONDS) / FIXED_STEP_SECONDS);
  for (let i = 0; i < steps && !shattered; i += 1) {
    scenario.drive!({ state, params, bodiesById }, FIXED_STEP_SECONDS);
    stepFixed(state, FIXED_STEP_SECONDS);
    if (!state.byId.get("earth")!.alive) {
      shattered = true;
    }
  }
  assert.ok(shattered, "a 32 km/s smash should destroy Earth within 400 days");
  assert.equal(state.byId.get("venus")!.alive, false, "the incoming world is also shattered");
  assert.ok(fragCount(state) >= 2, "the smash leaves a debris cloud");
});

console.log("");
if (problems.length > 0) {
  console.log(`==== SCENARIO PROBLEMS (${problems.length}) ====`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log("Scenario integrator checks passed");
