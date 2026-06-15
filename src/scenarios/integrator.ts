import { AU_KM } from "../data/constants";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { getBodyPositionKm } from "../simulation/solveOrbit";
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
// Distance from the launch origin past which an outbound body is logged as ejected
// (it keeps coasting; this is just for the narration layer). The origin ≈ the system
// barycentre to ~0.005 AU, negligible against this 250 AU threshold.
const EJECTION_DISTANCE_KM = 250 * AU_KM;
// Central difference half-step for seeding velocity from the Kepler solver.
const VELOCITY_SAMPLE_SECONDS = 3_600;

const PARTICIPANT_TYPES = new Set<CelestialBody["type"]>(["star", "planet"]);

// --- Tiny vector helpers (tuples, no allocation churn in hot loops) ----------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

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
  };
};

// Register a body injected by a scenario (rogue mass, fragment) into the live state.
export const addSimBody = (state: IntegratorState, body: SimBody) => {
  state.bodies.push(body);
  state.byId.set(body.id, body);
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

const handleCollisions = (state: IntegratorState) => {
  const live = state.bodies.filter((sb) => sb.alive);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (!a.alive || !b.alive) {
        continue;
      }
      const d = sub(b.posKm, a.posKm);
      const distSq = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const touch = (a.radiusKm + b.radiusKm) * COLLISION_FACTOR;
      if (distSq <= touch * touch) {
        merge(state, a, b);
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
