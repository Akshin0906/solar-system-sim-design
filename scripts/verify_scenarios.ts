import assert from "node:assert/strict";
import { bodies, bodiesById } from "../src/data";
import { AU_KM, DAY_SECONDS } from "../src/data/constants";
import { FIXED_STEP_SECONDS, addSimBody, seedIntegrator, stepFixed } from "../src/scenarios/integrator";
import { scenarioById } from "../src/scenarios/registry";
import type { Vec3 } from "../src/simulation/orbitalElements";
import type { IntegratorState } from "../src/scenarios/types";

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

console.log("");
if (problems.length > 0) {
  console.log(`==== SCENARIO PROBLEMS (${problems.length}) ====`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log("Scenario integrator checks passed");
