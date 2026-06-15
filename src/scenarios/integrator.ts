import { AU_KM } from "../data/constants";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { getBodyPositionKm } from "../simulation/solveOrbit";
import { clamp01, normalizeVec3, subVec3, vectorLength } from "../simulation/vec3";
import type { IntegratorState, SimBody } from "./types";

// --- Tuning -----------------------------------------------------------------
// Fixed physics step. The sim integrates in multiples of this regardless of frame
// rate, so under normal operation the trajectory is deterministic and frame-rate
// independent: same initial conditions + same elapsed sim-time => same outcome. (This
// holds as long as a frame stays under the substep cap below; past it, leftover
// sim-time is dropped and cadence can matter — see advance().) 30 minutes resolves the
// inner planets (~4000 steps/Mercury-orbit) while staying cheap.
export const FIXED_STEP_SECONDS = 1_800;
// Backstop so a huge time scale can't lock the tab. When hit, leftover sim-time is
// dropped (sim-time slows) rather than spiralling — and `state.throttled` flips so
// the UI can say so. No silent truncation.
export const MAX_SUBSTEPS_PER_FRAME = 4_000;
// Plummer softening: forces use (r^2 + EPS^2) so a near-miss can't inject infinite
// energy with a fixed step. ~30k km is well below planetary separations but smooths
// the singularity that collision-merging would otherwise have to catch perfectly.
const SOFTENING_KM = 30_000;
const SOFTENING_SQ = SOFTENING_KM * SOFTENING_KM;
// Two bodies merge when their centres come within this multiple of summed radii.
const COLLISION_FACTOR = 1.0;

// --- Debris / shatter tuning ------------------------------------------------
// Default ceiling on simultaneously-live fragments. Scenarios expose this as a slider.
export const DEFAULT_FRAGMENT_CAP = 40;
// A contact only disrupts when the bodies are mass-comparable. Below this smaller/larger
// mass ratio the small body is simply absorbed (a pebble can't shatter a planet; a planet
// can't shatter the Sun) — it stays a clean merge regardless of speed.
const SHATTER_MASS_RATIO_MIN = 0.02;
// Relative speed thresholds, in units of the pair's mutual escape speed at contact:
//   < GRAZE   → clean merge (gentle accretion, no debris)
//   GRAZE..SHATTER → giant-impact merge: bodies coalesce but shed a re-accreting ring
//   > SHATTER → catastrophic disruption: both bodies break into a debris cloud
const GRAZE_ESCAPE_FACTOR = 0.6;
const SHATTER_ESCAPE_FACTOR = 1.5;
// Max fraction of combined mass thrown off as a ring in the giant-impact regime.
const RING_MASS_FRACTION_MAX = 0.4;
// Characteristic debris dispersal speed, as a fraction of the impact relative speed.
const SHATTER_DISPERSAL_FACTOR = 0.35;
// Fragments emitted per disruptive event, before the global cap clamps it.
const MIN_EVENT_FRAGMENTS = 6;
const MAX_EVENT_FRAGMENTS = 24;
// Fragment collision radii are inflated for the contact test only (not their drawn or
// gravitating size): real shard radii are so small they'd almost never re-collide, so a
// debris ring would never re-accrete. This keeps re-accretion observable without faking
// mass. Applied to fragments in the contact test only.
const FRAGMENT_COLLISION_INFLATE = 6;
// A mass-disparate contact (small body into a much larger one) cratering threshold: above
// this μ the larger body is a star or black hole — infalling matter is swallowed with no
// ejecta. Below it the larger body is planet-scale, so a fast small impactor excavates a
// crater and throws ejecta. (Sun μ≈1.3e11, Jupiter μ≈1.3e8, so 1e10 cleanly splits them.)
const STELLAR_MU = 1e10;
// Below this relative speed a disparate contact is gentle accretion, not a cratering hit.
const CRATER_SPEED_MIN = 3;
// Cratering ejecta mass ≈ this × the impactor mass (capped to a slice of the target).
const EJECTA_MASS_FACTOR = 4;
const MIN_EJECTA = 4;
const MAX_EJECTA = 10;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈2.39996 rad — Fibonacci-sphere step
const GOLDEN_FRAC = 0.618_033_988_749_895; // 1/φ — low-discrepancy index hashing
// Distance from the launch origin past which an outbound body is logged as ejected
// (it keeps coasting; this is just for the narration layer). The origin ≈ the system
// barycentre to ~0.005 AU, negligible against this 250 AU threshold.
const EJECTION_DISTANCE_KM = 250 * AU_KM;
// Central difference half-step for seeding velocity from the Kepler solver.
const VELOCITY_SAMPLE_SECONDS = 3_600;

const PARTICIPANT_TYPES = new Set<CelestialBody["type"]>(["star", "planet"]);

// Heliocentric velocity of a data body via central difference of the pure Kepler
// solver. The Sun sits at the origin for all dates, so this returns ~0 for it and
// the real orbital velocity for everything else — no special-casing required.
const seedVelocityKmS = (
  body: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  startDateMs: number,
): Vec3 => {
  const ahead = getBodyPositionKm(body, bodiesById, new Date(startDateMs + VELOCITY_SAMPLE_SECONDS * 1_000));
  const behind = getBodyPositionKm(body, bodiesById, new Date(startDateMs - VELOCITY_SAMPLE_SECONDS * 1_000));
  const denom = 2 * VELOCITY_SAMPLE_SECONDS;
  return [(ahead[0] - behind[0]) / denom, (ahead[1] - behind[1]) / denom, (ahead[2] - behind[2]) / denom];
};

export const seedIntegrator = (
  bodies: CelestialBody[],
  bodiesById: Map<string, CelestialBody>,
  startDateMs: number,
): IntegratorState => {
  const participants = bodies.filter((body) => PARTICIPANT_TYPES.has(body.type));
  const simBodies: SimBody[] = participants.map((body) => ({
    id: body.id,
    sourceId: body.id,
    kind: "body",
    posKm: getBodyPositionKm(body, bodiesById, new Date(startDateMs)),
    velKmS: seedVelocityKmS(body, bodiesById, startDateMs),
    muKm3S2: body.physical.gravitationalParameterKm3S2 ?? 0,
    radiusKm: body.physical.radiusKm,
    color: body.physical.color,
    alive: true,
  }));

  // Re-centre into the centre-of-mass frame so the whole system doesn't slowly
  // translate off-screen (the heliocentric seed carries a small net momentum).
  // Mass is proportional to mu, so the G in GM cancels in the weighted average.
  let totalMu = 0;
  const weightedV: Vec3 = [0, 0, 0];
  for (const sb of simBodies) {
    totalMu += sb.muKm3S2;
    weightedV[0] += sb.muKm3S2 * sb.velKmS[0];
    weightedV[1] += sb.muKm3S2 * sb.velKmS[1];
    weightedV[2] += sb.muKm3S2 * sb.velKmS[2];
  }
  if (totalMu > 0) {
    const vcom: Vec3 = [weightedV[0] / totalMu, weightedV[1] / totalMu, weightedV[2] / totalMu];
    for (const sb of simBodies) {
      sb.velKmS = [sb.velKmS[0] - vcom[0], sb.velKmS[1] - vcom[1], sb.velKmS[2] - vcom[2]];
    }
  }

  return {
    bodies: simBodies,
    byId: new Map(simBodies.map((sb) => [sb.id, sb])),
    participantIds: new Set(participants.map((body) => body.id)),
    startDateMs,
    elapsedSimSeconds: 0,
    accumulatorSeconds: 0,
    throttled: false,
    events: [],
    ejectedIds: new Set(),
    newlyConsumed: [],
    revision: 0,
    shatterEnabled: false,
    fragmentCap: DEFAULT_FRAGMENT_CAP,
    fragmentCapHit: 0,
    fragmentSeq: 0,
    impactFx: [],
  };
};

// Opt a scenario into the debris/shatter path with a fragment ceiling. Called from a
// scenario's seed() so non-debris scenarios keep pure-merge physics by default.
export const enableDebris = (state: IntegratorState, fragmentCap = DEFAULT_FRAGMENT_CAP) => {
  state.shatterEnabled = true;
  state.fragmentCap = Math.max(2, Math.round(fragmentCap));
};

// Register a body injected by a scenario (rogue mass, fragment) into the live state.
export const addSimBody = (state: IntegratorState, body: SimBody) => {
  state.bodies.push(body);
  state.byId.set(body.id, body);
  state.revision += 1;
};

// Newtonian acceleration on every live body from every other massive live body.
// O(n^2) over a handful of bodies — trivial. Softened to stay finite on close passes.
const accelerations = (live: SimBody[]): Vec3[] => {
  const acc: Vec3[] = live.map(() => [0, 0, 0]);

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      const dx = b.posKm[0] - a.posKm[0];
      const dy = b.posKm[1] - a.posKm[1];
      const dz = b.posKm[2] - a.posKm[2];
      const distSq = dx * dx + dy * dy + dz * dz + SOFTENING_SQ;
      const invDistCube = 1 / (distSq * Math.sqrt(distSq));

      if (b.muKm3S2 > 0) {
        const s = b.muKm3S2 * invDistCube;
        acc[i][0] += s * dx;
        acc[i][1] += s * dy;
        acc[i][2] += s * dz;
      }
      if (a.muKm3S2 > 0) {
        const s = a.muKm3S2 * invDistCube;
        acc[j][0] -= s * dx;
        acc[j][1] -= s * dy;
        acc[j][2] -= s * dz;
      }
    }
  }

  return acc;
};

const cubeRoot = (value: number) => Math.cbrt(value);

// Inelastic, momentum-conserving merge. The more massive body survives; a massless
// test particle is simply absorbed. Volume (radius^3) adds. Logs a collision event,
// and records a consumed data-body so the scene can stop drawing it.
const merge = (state: IntegratorState, a: SimBody, b: SimBody) => {
  const survivor = a.muKm3S2 >= b.muKm3S2 ? a : b;
  const victim = survivor === a ? b : a;
  const totalMu = survivor.muKm3S2 + victim.muKm3S2;

  if (totalMu > 0) {
    survivor.posKm = [
      (survivor.muKm3S2 * survivor.posKm[0] + victim.muKm3S2 * victim.posKm[0]) / totalMu,
      (survivor.muKm3S2 * survivor.posKm[1] + victim.muKm3S2 * victim.posKm[1]) / totalMu,
      (survivor.muKm3S2 * survivor.posKm[2] + victim.muKm3S2 * victim.posKm[2]) / totalMu,
    ];
    survivor.velKmS = [
      (survivor.muKm3S2 * survivor.velKmS[0] + victim.muKm3S2 * victim.velKmS[0]) / totalMu,
      (survivor.muKm3S2 * survivor.velKmS[1] + victim.muKm3S2 * victim.velKmS[1]) / totalMu,
      (survivor.muKm3S2 * survivor.velKmS[2] + victim.muKm3S2 * victim.velKmS[2]) / totalMu,
    ];
  }
  survivor.muKm3S2 = totalMu;
  survivor.radiusKm = cubeRoot(survivor.radiusKm ** 3 + victim.radiusKm ** 3);
  victim.alive = false;
  state.revision += 1;

  state.events.push({
    type: "collision",
    simSeconds: state.elapsedSimSeconds,
    aId: survivor.id,
    bId: victim.id,
    detail: `${victim.id} → ${survivor.id}`,
  });
  if (victim.sourceId) {
    state.newlyConsumed.push(victim.sourceId);
  }
};

// --- Debris / shatter -------------------------------------------------------

// Mass-weighted average of two vectors (centre-of-mass position or velocity); midpoint
// when both masses are zero.
const massWeighted = (va: Vec3, ma: number, vb: Vec3, mb: number): Vec3 => {
  const total = ma + mb;
  if (total <= 0) {
    return [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
  }
  return [
    (ma * va[0] + mb * vb[0]) / total,
    (ma * va[1] + mb * vb[1]) / total,
    (ma * va[2] + mb * vb[2]) / total,
  ];
};

// Mutual escape speed at contact — the natural scale separating gentle accretion from
// disruptive impact.
const escapeSpeedKmS = (a: SimBody, b: SimBody) =>
  Math.sqrt((2 * (a.muKm3S2 + b.muKm3S2)) / Math.max(a.radiusKm + b.radiusKm, 1));

// Deterministic, evenly-spread unit direction i of n (Fibonacci sphere) — no RNG, so
// every run reproduces exactly.
const fibSphere = (i: number, n: number): Vec3 => {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
};

// Deterministic pseudo-random in [0,1) from an index (golden-ratio low-discrepancy).
const goldenFrac = (i: number) => {
  const v = (i + 1) * GOLDEN_FRAC;
  return v - Math.floor(v);
};

// Mark a body destroyed: flip alive, bump the live-set revision, and record a consumed
// data-body so the scene stops drawing the original planet/sun.
const killBody = (state: IntegratorState, sb: SimBody) => {
  if (!sb.alive) {
    return;
  }
  sb.alive = false;
  state.revision += 1;
  if (sb.sourceId) {
    state.newlyConsumed.push(sb.sourceId);
  }
};

// Queue a transient visual event (impact flash / shockwave) for the scene's VFX layer.
const pushImpactFx = (
  state: IntegratorState,
  kind: "flash" | "shockwave",
  posKm: Vec3,
  scaleKm: number,
  color: string,
) => {
  state.impactFx.push({ kind, posKm: [posKm[0], posKm[1], posKm[2]], scaleKm, color });
};

// Clamp a desired fragment count to the global cap (counting fragments already live).
// Records the cap on fragmentCapHit when it bites so the panel can surface the coalesce.
const fragmentBudget = (state: IntegratorState, desired: number): number => {
  let liveFrag = 0;
  for (const sb of state.bodies) {
    if (sb.alive && sb.kind === "fragment") {
      liveFrag += 1;
    }
  }
  const count = Math.max(0, Math.min(desired, state.fragmentCap - liveFrag));
  if (count < desired) {
    state.fragmentCapHit = state.fragmentCap;
  }
  return count;
};

// Core debris emitter. Spawns `count` fragments sharing `totalMu` mass and
// `totalVolumeKm3` volume, centred on (comPos, comVel) and dispersing at ~dispersalSpeed.
// The mass-weighted mean dispersal is removed so the burst conserves linear momentum
// EXACTLY about comVel. `bias` elongates the cloud along an axis (impact cone, tidal tail).
const emitFragments = (
  state: IntegratorState,
  count: number,
  totalMu: number,
  totalVolumeKm3: number,
  comPos: Vec3,
  comVel: Vec3,
  dispersalSpeed: number,
  color: string,
  bias?: { dir: Vec3; strength: number },
): SimBody[] => {
  // Gentle power-law mass split: a few big shards + many small ones. Normalised so the
  // weights sum to 1 ⇒ Σ fragment mass = totalMu and Σ radius³ = totalVolumeKm3 exactly.
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < count; i += 1) {
    const w = 1 / Math.pow(i + 1, 0.8);
    weights.push(w);
    wSum += w;
  }
  for (let i = 0; i < count; i += 1) {
    weights[i] /= wSum;
  }

  const biasDir = bias ? normalizeVec3(bias.dir) : null;
  const biasK = bias ? clamp01(bias.strength) : 0;
  const parentRadius = Math.cbrt(Math.max(totalVolumeKm3, 1));

  const dirs: Vec3[] = [];
  const disp: Vec3[] = [];
  const vbar: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i += 1) {
    let d = fibSphere(i, count);
    if (biasDir) {
      // Pull each direction toward the ±bias axis so the cloud stretches along it.
      const sign = d[0] * biasDir[0] + d[1] * biasDir[1] + d[2] * biasDir[2] >= 0 ? 1 : -1;
      d = normalizeVec3([
        d[0] + biasDir[0] * sign * biasK * 1.6,
        d[1] + biasDir[1] * sign * biasK * 1.6,
        d[2] + biasDir[2] * sign * biasK * 1.6,
      ]);
    }
    dirs.push(d);
    const speed = dispersalSpeed * (0.4 + 0.9 * goldenFrac(i));
    const dv: Vec3 = [d[0] * speed, d[1] * speed, d[2] * speed];
    disp.push(dv);
    vbar[0] += weights[i] * dv[0];
    vbar[1] += weights[i] * dv[1];
    vbar[2] += weights[i] * dv[2];
  }

  const fragments: SimBody[] = [];
  for (let i = 0; i < count; i += 1) {
    const radiusKm = Math.cbrt(Math.max(totalVolumeKm3 * weights[i], 1));
    const shell = parentRadius * (0.8 + 1.4 * goldenFrac(i + 7)) + radiusKm;
    const frag: SimBody = {
      id: `frag-${state.fragmentSeq}`,
      kind: "fragment",
      posKm: [
        comPos[0] + dirs[i][0] * shell,
        comPos[1] + dirs[i][1] * shell,
        comPos[2] + dirs[i][2] * shell,
      ],
      velKmS: [
        comVel[0] + disp[i][0] - vbar[0],
        comVel[1] + disp[i][1] - vbar[1],
        comVel[2] + disp[i][2] - vbar[2],
      ],
      muKm3S2: totalMu * weights[i],
      radiusKm,
      color,
      alive: true,
    };
    state.fragmentSeq += 1;
    addSimBody(state, frag); // bumps state.revision so the scene grows its mesh list
    fragments.push(frag);
  }
  return fragments;
};

// Catastrophic disruption: both bodies break into a debris cloud elongated along the
// impact axis. Conserves mass and momentum. Falls back to a clean merge if the cap leaves
// no room for a meaningful cloud (coalescing the mass into the survivor).
const shatter = (state: IntegratorState, a: SimBody, b: SimBody, speedRel: number) => {
  const escSpeed = escapeSpeedKmS(a, b);
  const energyRatio = clamp01((speedRel / Math.max(escSpeed, 1e-6) - SHATTER_ESCAPE_FACTOR) / 6);
  const desired = Math.round(MIN_EVENT_FRAGMENTS + (MAX_EVENT_FRAGMENTS - MIN_EVENT_FRAGMENTS) * energyRatio);
  const count = fragmentBudget(state, Math.max(MIN_EVENT_FRAGMENTS, desired));
  if (count < 2) {
    merge(state, a, b);
    return;
  }
  const totalMu = a.muKm3S2 + b.muKm3S2;
  const comPos = massWeighted(a.posKm, a.muKm3S2, b.posKm, b.muKm3S2);
  const comVel = massWeighted(a.velKmS, a.muKm3S2, b.velKmS, b.muKm3S2);
  const totalVol = a.radiusKm ** 3 + b.radiusKm ** 3;
  const color = a.muKm3S2 >= b.muKm3S2 ? a.color : b.color;
  const impactAxis = subVec3(a.velKmS, b.velKmS);
  const flashScale = Math.cbrt(totalVol);
  pushImpactFx(state, "flash", comPos, flashScale, "#fff2d0");
  pushImpactFx(state, "shockwave", comPos, flashScale, color);
  killBody(state, a);
  killBody(state, b);
  emitFragments(state, count, totalMu, totalVol, comPos, comVel, SHATTER_DISPERSAL_FACTOR * speedRel, color, {
    dir: impactAxis,
    strength: 0.45,
  });
  state.events.push({
    type: "collision",
    simSeconds: state.elapsedSimSeconds,
    aId: a.id,
    bId: b.id,
    detail: `${a.sourceId ?? a.id} + ${b.sourceId ?? b.id} shattered → ${count} fragments`,
  });
};

// Giant-impact merge: the bodies coalesce into a molten remnant (the more massive
// survivor, moved to the centre of mass) while shedding `ringFraction` of the combined
// mass as a debris ring dispersed near escape speed — marginally bound, so it forms a
// disk and partially re-accretes. Conserves mass, volume, and momentum.
const mergeWithRing = (state: IntegratorState, a: SimBody, b: SimBody, ringFraction: number) => {
  const desired = Math.round(
    MIN_EVENT_FRAGMENTS + (MAX_EVENT_FRAGMENTS - MIN_EVENT_FRAGMENTS) * clamp01(ringFraction / RING_MASS_FRACTION_MAX),
  );
  const count = fragmentBudget(state, Math.max(MIN_EVENT_FRAGMENTS, desired));
  if (count < 2 || ringFraction <= 0) {
    merge(state, a, b);
    return;
  }
  const totalMu = a.muKm3S2 + b.muKm3S2;
  const totalVol = a.radiusKm ** 3 + b.radiusKm ** 3;
  const comPos = massWeighted(a.posKm, a.muKm3S2, b.posKm, b.muKm3S2);
  const comVel = massWeighted(a.velKmS, a.muKm3S2, b.velKmS, b.muKm3S2);
  const escSpeed = escapeSpeedKmS(a, b);

  const ringMu = totalMu * ringFraction;
  const ringVol = totalVol * ringFraction;

  const survivor = a.muKm3S2 >= b.muKm3S2 ? a : b;
  const victim = survivor === a ? b : a;
  // Remnant keeps (1-ringFraction) of mass/volume at the centre of mass, moving at the
  // bulk velocity; the ring below carries exactly the rest ⇒ momentum conserved.
  survivor.posKm = [comPos[0], comPos[1], comPos[2]];
  survivor.velKmS = [comVel[0], comVel[1], comVel[2]];
  survivor.muKm3S2 = totalMu - ringMu;
  survivor.radiusKm = Math.cbrt(Math.max(totalVol - ringVol, 1));
  const ringFlashScale = Math.cbrt(totalVol);
  pushImpactFx(state, "flash", comPos, ringFlashScale, "#ffe6c4");
  pushImpactFx(state, "shockwave", comPos, ringFlashScale, survivor.color);
  killBody(state, victim);

  emitFragments(state, count, ringMu, ringVol, comPos, comVel, escSpeed * 0.95, survivor.color);
  state.events.push({
    type: "collision",
    simSeconds: state.elapsedSimSeconds,
    aId: survivor.id,
    bId: victim.id,
    detail: `${victim.sourceId ?? victim.id} → ${survivor.sourceId ?? survivor.id} + ring (${count})`,
  });
};

// Directed cratering ejecta: fragments sprayed into the hemisphere around `normalDir`
// (the impact normal) at ~`speed`. Returns the net momentum the spray carries about
// `baseVel`, so the caller can recoil the target and conserve momentum exactly.
const emitEjecta = (
  state: IntegratorState,
  count: number,
  totalMu: number,
  totalVolumeKm3: number,
  originPos: Vec3,
  baseVel: Vec3,
  normalDir: Vec3,
  speed: number,
  color: string,
): Vec3 => {
  const n = normalizeVec3(normalDir);
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < count; i += 1) {
    const w = 1 / Math.pow(i + 1, 0.8);
    weights.push(w);
    wSum += w;
  }
  for (let i = 0; i < count; i += 1) {
    weights[i] /= wSum;
  }
  const parentRadius = Math.cbrt(Math.max(totalVolumeKm3, 1));
  const pSplash: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i += 1) {
    let d = fibSphere(i, count);
    // Fold into the +n hemisphere, then bias toward n for an ejecta cone.
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    if (dn < 0) {
      d = [d[0] - 2 * dn * n[0], d[1] - 2 * dn * n[1], d[2] - 2 * dn * n[2]];
    }
    d = normalizeVec3([d[0] * 0.55 + n[0] * 0.9, d[1] * 0.55 + n[1] * 0.9, d[2] * 0.55 + n[2] * 0.9]);
    const sp = speed * (0.5 + 0.8 * goldenFrac(i));
    const ejMu = totalMu * weights[i];
    const splash: Vec3 = [d[0] * sp, d[1] * sp, d[2] * sp];
    pSplash[0] += ejMu * splash[0];
    pSplash[1] += ejMu * splash[1];
    pSplash[2] += ejMu * splash[2];
    const radiusKm = Math.cbrt(Math.max(totalVolumeKm3 * weights[i], 1));
    const off = parentRadius * 0.4 + radiusKm;
    addSimBody(state, {
      id: `frag-${state.fragmentSeq}`,
      kind: "fragment",
      posKm: [originPos[0] + d[0] * off, originPos[1] + d[1] * off, originPos[2] + d[2] * off],
      velKmS: [baseVel[0] + splash[0], baseVel[1] + splash[1], baseVel[2] + splash[2]],
      muKm3S2: ejMu,
      radiusKm,
      color,
      alive: true,
    });
    state.fragmentSeq += 1;
  }
  return pSplash;
};

// Cratering surface impact: a fast small impactor is absorbed by a planet-scale target,
// excavating a crater and throwing ejecta back out of the impact point. The target recoils
// so mass and momentum are conserved exactly. Emits an impact flash + shockwave.
const crater = (state: IntegratorState, a: SimBody, b: SimBody, speedRel: number) => {
  const planet = a.muKm3S2 >= b.muKm3S2 ? a : b;
  const impactor = planet === a ? b : a;
  const totalMu = planet.muKm3S2 + impactor.muKm3S2;
  const totalVol = planet.radiusKm ** 3 + impactor.radiusKm ** 3;
  const comVel = massWeighted(planet.velKmS, planet.muKm3S2, impactor.velKmS, impactor.muKm3S2);
  const normal = normalizeVec3(subVec3(impactor.posKm, planet.posKm));
  const impactPos: Vec3 = [
    planet.posKm[0] + normal[0] * planet.radiusKm,
    planet.posKm[1] + normal[1] * planet.radiusKm,
    planet.posKm[2] + normal[2] * planet.radiusKm,
  ];
  // Impact flash + shockwave fire regardless of whether ejecta fit under the cap.
  pushImpactFx(state, "flash", impactPos, planet.radiusKm, "#fff0c8");
  pushImpactFx(state, "shockwave", impactPos, planet.radiusKm, planet.color);

  const ejectaMu = Math.min(impactor.muKm3S2 * EJECTA_MASS_FACTOR, planet.muKm3S2 * 0.05);
  const ejectaVol = Math.min(impactor.radiusKm ** 3 * EJECTA_MASS_FACTOR, totalVol * 0.05);
  const desired = Math.round(MIN_EJECTA + (MAX_EJECTA - MIN_EJECTA) * clamp01(speedRel / 40));
  const count = fragmentBudget(state, Math.max(MIN_EJECTA, desired));
  if (count < 2 || ejectaMu <= 0) {
    merge(state, a, b);
    return;
  }
  const pSplash = emitEjecta(
    state,
    count,
    ejectaMu,
    ejectaVol,
    impactPos,
    comVel,
    normal,
    SHATTER_DISPERSAL_FACTOR * speedRel,
    planet.color,
  );
  const survivorMu = totalMu - ejectaMu;
  killBody(state, impactor);
  planet.muKm3S2 = survivorMu;
  planet.radiusKm = Math.cbrt(Math.max(totalVol - ejectaVol, 1));
  // Recoil so total momentum = totalMu·comVel (the ejecta carry pSplash about comVel).
  planet.velKmS = [
    comVel[0] - pSplash[0] / survivorMu,
    comVel[1] - pSplash[1] / survivorMu,
    comVel[2] - pSplash[2] / survivorMu,
  ];
  state.events.push({
    type: "collision",
    simSeconds: state.elapsedSimSeconds,
    aId: planet.id,
    bId: impactor.id,
    detail: `${impactor.sourceId ?? impactor.id} cratered ${planet.sourceId ?? planet.id} → ${count} ejecta`,
  });
};

// Tidal (Roche) disruption of a single body: when tidal stress from a nearby massive body
// exceeds self-gravity, the body unravels into a stream. Keeps its bulk velocity; `streamDir`
// (body→disruptor) elongates the debris into the characteristic leading/trailing tail.
// Returns true if it disrupted. Exposed for a scenario's drive() to call on a Roche pass.
export const tidalDisrupt = (state: IntegratorState, body: SimBody, streamDir: Vec3): boolean => {
  if (!body.alive || body.muKm3S2 <= 0) {
    return false;
  }
  const count = fragmentBudget(state, Math.max(MIN_EVENT_FRAGMENTS, Math.round(MAX_EVENT_FRAGMENTS * 0.85)));
  if (count < 2) {
    return false;
  }
  const selfEsc = Math.sqrt((2 * body.muKm3S2) / Math.max(body.radiusKm, 1));
  killBody(state, body);
  emitFragments(
    state,
    count,
    body.muKm3S2,
    body.radiusKm ** 3,
    [body.posKm[0], body.posKm[1], body.posKm[2]],
    [body.velKmS[0], body.velKmS[1], body.velKmS[2]],
    selfEsc * 1.4,
    body.color,
    { dir: streamDir, strength: 0.85 },
  );
  state.events.push({
    type: "collision",
    simSeconds: state.elapsedSimSeconds,
    aId: body.id,
    detail: `${body.sourceId ?? body.id} tidally disrupted → ${count} fragments`,
  });
  return true;
};

export type ContactOutcome = "merge" | "crater" | "ring" | "shatter";

// Decide how a contact resolves when debris is enabled.
//   - massless test particle → absorbed (merge).
//   - mass-disparate (small into much larger): a star/black hole swallows it (merge); a
//     planet-scale target is cratered by a fast impactor (crater), or accretes a slow one.
//   - comparable masses: relative speed vs. mutual escape speed picks
//     clean merge / giant-impact ring / catastrophic shatter.
export const contactOutcome = (a: SimBody, b: SimBody): ContactOutcome => {
  if (a.muKm3S2 <= 0 || b.muKm3S2 <= 0) {
    return "merge";
  }
  const small = Math.min(a.muKm3S2, b.muKm3S2);
  const large = Math.max(a.muKm3S2, b.muKm3S2);
  if (small / large < SHATTER_MASS_RATIO_MIN) {
    if (large >= STELLAR_MU) {
      return "merge"; // swallowed by a star or black hole — no ejecta splash
    }
    const speedRel = vectorLength(subVec3(a.velKmS, b.velKmS));
    return speedRel > CRATER_SPEED_MIN ? "crater" : "merge";
  }
  const speedRel = vectorLength(subVec3(a.velKmS, b.velKmS));
  const escSpeed = escapeSpeedKmS(a, b);
  if (speedRel > SHATTER_ESCAPE_FACTOR * escSpeed) {
    return "shatter";
  }
  if (speedRel > GRAZE_ESCAPE_FACTOR * escSpeed) {
    return "ring";
  }
  return "merge";
};

// Resolve a single contact under the active debris policy (merge / crater / ring / shatter).
// Exposed so tests can exercise the physics directly without collision-timing games.
export const resolveContact = (state: IntegratorState, a: SimBody, b: SimBody) => {
  if (!state.shatterEnabled) {
    merge(state, a, b);
    return;
  }
  const outcome = contactOutcome(a, b);
  if (outcome === "merge") {
    merge(state, a, b);
    return;
  }
  const speedRel = vectorLength(subVec3(a.velKmS, b.velKmS));
  if (outcome === "crater") {
    crater(state, a, b, speedRel);
    return;
  }
  if (outcome === "shatter") {
    shatter(state, a, b, speedRel);
    return;
  }
  const escSpeed = escapeSpeedKmS(a, b);
  const ringFraction =
    clamp01((speedRel / Math.max(escSpeed, 1e-6) - GRAZE_ESCAPE_FACTOR) / (SHATTER_ESCAPE_FACTOR - GRAZE_ESCAPE_FACTOR)) *
    RING_MASS_FRACTION_MAX;
  mergeWithRing(state, a, b, ringFraction);
};

// Contact-test radius. Fragment shards are so small they'd almost never re-collide, so a
// debris ring would never re-accrete. A modest inflation (contact test ONLY — not their
// drawn or gravitating size) keeps re-accretion observable without faking any mass.
const collisionRadius = (sb: SimBody) =>
  sb.kind === "fragment" ? sb.radiusKm * FRAGMENT_COLLISION_INFLATE : sb.radiusKm;

const handleCollisions = (state: IntegratorState) => {
  const live = state.bodies.filter((sb) => sb.alive);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (!a.alive || !b.alive) {
        continue;
      }
      const d = subVec3(b.posKm, a.posKm);
      const distSq = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const touch = (collisionRadius(a) + collisionRadius(b)) * COLLISION_FACTOR;
      if (distSq <= touch * touch) {
        resolveContact(state, a, b);
      }
    }
  }
};

const logEjections = (state: IntegratorState) => {
  for (const sb of state.bodies) {
    if (!sb.alive || state.ejectedIds.has(sb.id)) {
      continue;
    }
    const r = Math.hypot(sb.posKm[0], sb.posKm[1], sb.posKm[2]);
    if (r > EJECTION_DISTANCE_KM) {
      const outbound = sb.posKm[0] * sb.velKmS[0] + sb.posKm[1] * sb.velKmS[1] + sb.posKm[2] * sb.velKmS[2] > 0;
      if (outbound) {
        state.ejectedIds.add(sb.id);
        state.events.push({
          type: "ejection",
          simSeconds: state.elapsedSimSeconds,
          aId: sb.id,
          detail: `${sb.sourceId ?? sb.id} ejected`,
        });
      }
    }
  }
};

// One fixed leapfrog (kick-drift-kick) step. Symplectic, so bound orbits keep their
// energy over long runs instead of spiralling in/out.
export const stepFixed = (state: IntegratorState, dt: number) => {
  const half = dt * 0.5;

  let live = state.bodies.filter((sb) => sb.alive);
  const a0 = accelerations(live);
  for (let i = 0; i < live.length; i += 1) {
    const sb = live[i];
    sb.velKmS[0] += a0[i][0] * half;
    sb.velKmS[1] += a0[i][1] * half;
    sb.velKmS[2] += a0[i][2] * half;
    sb.posKm[0] += sb.velKmS[0] * dt;
    sb.posKm[1] += sb.velKmS[1] * dt;
    sb.posKm[2] += sb.velKmS[2] * dt;
  }

  handleCollisions(state);

  live = state.bodies.filter((sb) => sb.alive);
  const a1 = accelerations(live);
  for (let i = 0; i < live.length; i += 1) {
    const sb = live[i];
    sb.velKmS[0] += a1[i][0] * half;
    sb.velKmS[1] += a1[i][1] * half;
    sb.velKmS[2] += a1[i][2] * half;
  }

  state.elapsedSimSeconds += dt;
  logEjections(state);
};

// Advance the sim by a chunk of real frame time, scaled to sim-time. Returns the
// number of fixed steps actually run (0 while paused or below one step of budget).
// `beforeStep` runs once per fixed step (deterministic) for non-gravitational drivers
// such as a swelling Sun, so those effects stay frame-rate independent too.
export const advance = (
  state: IntegratorState,
  simSecondsToAdd: number,
  beforeStep?: (dtSeconds: number) => void,
): number => {
  state.accumulatorSeconds += simSecondsToAdd;
  let steps = 0;
  while (state.accumulatorSeconds >= FIXED_STEP_SECONDS && steps < MAX_SUBSTEPS_PER_FRAME) {
    beforeStep?.(FIXED_STEP_SECONDS);
    stepFixed(state, FIXED_STEP_SECONDS);
    state.accumulatorSeconds -= FIXED_STEP_SECONDS;
    steps += 1;
  }
  if (steps >= MAX_SUBSTEPS_PER_FRAME) {
    // Couldn't keep up this frame: drop the backlog so we don't spiral, and flag it.
    state.accumulatorSeconds = 0;
    state.throttled = true;
  } else {
    state.throttled = false;
  }
  return steps;
};
