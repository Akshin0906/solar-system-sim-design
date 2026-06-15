import { DAY_SECONDS } from "../data/constants";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { getOrbitPositionKm } from "../simulation/solveOrbit";
import { addVec3 } from "../simulation/vec3";
import { computeScenePositions, scaleMoonOffset, scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import { advance, seedIntegrator } from "./integrator";
import { scenarioById } from "./registry";
import type { DoomsdayScenario, IntegratorState, SimBody } from "./types";

// The live, mutable simulation. This deliberately lives OUTSIDE React/Zustand: it is
// rewritten every animation frame across many fixed steps, and routing that through
// state would thrash rendering. The scenario store holds only the low-frequency config
// (which scenario, params, scale, status); this module holds the numbers. Resetting a
// scenario is just `current = null` — the scene falls straight back to Kepler.
type Runtime = {
  instanceId: number;
  scenario: DoomsdayScenario;
  params: Record<string, number>;
  state: IntegratorState;
  bodies: CelestialBody[];
  bodiesById: Map<string, CelestialBody>;
  frozenDate: Date;
};

let current: Runtime | null = null;

export const runtimeInstanceId = () => current?.instanceId ?? null;

// (Re)seed the integrator for a scenario instance. Called from the frame loop the
// first time it notices the store's instanceId changed (start, or a param edit).
export const startRuntime = (
  instanceId: number,
  scenarioId: string,
  params: Record<string, number>,
  bodies: CelestialBody[],
  bodiesById: Map<string, CelestialBody>,
  startDateMs: number,
) => {
  const scenario = scenarioById.get(scenarioId);
  if (!scenario) {
    current = null;
    return;
  }
  const state = seedIntegrator(bodies, bodiesById, startDateMs);
  scenario.seed?.({ state, params, bodiesById });
  current = {
    instanceId,
    scenario,
    params,
    state,
    bodies,
    bodiesById,
    frozenDate: new Date(startDateMs),
  };
};

export const stopRuntime = () => {
  current = null;
};

// Step the live sim forward by one rendered frame's worth of time.
export const stepRuntime = (realDeltaSeconds: number, timeScaleDaysPerSec: number) => {
  if (!current) {
    return;
  }
  const simSeconds = realDeltaSeconds * timeScaleDaysPerSec * DAY_SECONDS;
  const { scenario, params, state, bodiesById } = current;
  const beforeStep = scenario.drive ? (dt: number) => scenario.drive!({ state, params, bodiesById }, dt) : undefined;
  advance(state, simSeconds, beforeStep);
};

// Project the live sim into the scene-position cache that BodyMesh already reads.
// Reuses the exact same scaling the normal pipeline uses, so integrated planets sit
// in the same visual space as everything else.
//   - participants (Sun + planets): from the integrator
//   - moons of participants: glued to their live parent (they stop orbiting mid-event)
//   - everything else (dwarfs, distant moons): frozen at the launch date
export const writeScenePositions = (
  positions: Record<string, Vec3>,
  mode: ScaleMode,
) => {
  if (!current) {
    return;
  }
  const { state, bodies, bodiesById, frozenDate } = current;

  // 1. Base layer: every body at the frozen launch date in the current scale mode.
  computeScenePositions(bodies, bodiesById, frozenDate, mode, positions);

  // 2. Overwrite live participants with integrated positions.
  for (const sb of state.bodies) {
    if (sb.sourceId && sb.alive && state.participantIds.has(sb.sourceId)) {
      positions[sb.sourceId] = scaleVectorFromSun(sb.posKm, mode);
    }
  }

  // 3. Re-glue each living participant's moons to its moved position. Drop the moons
  //    of a destroyed participant so they don't linger at the parent's launch spot.
  for (const body of bodies) {
    if (body.type !== "moon" || !body.parentId || !body.orbit) {
      continue;
    }
    if (!state.participantIds.has(body.parentId)) {
      continue;
    }
    const parentSim = state.byId.get(body.parentId);
    if (parentSim && !parentSim.alive) {
      delete positions[body.id];
      continue;
    }
    const parentPosition = positions[body.parentId];
    if (!parentPosition) {
      continue;
    }
    const localKm = getOrbitPositionKm(body.orbit, frozenDate);
    const offset = scaleMoonOffset(localKm, mode, { parentBody: bodiesById.get(body.parentId), moonBody: body });
    positions[body.id] = addVec3(parentPosition, offset);
  }

  // 4. Drop consumed participants entirely. The base layer (step 1) rewrote a frozen
  //    Kepler position for them; CameraRig reads positionsRef directly (it doesn't see
  //    the React render filter), so leaving it would frame/follow a destroyed body's
  //    ghost. Deleting lets CameraRig's missing-id fallbacks take over.
  for (const sb of state.bodies) {
    if (sb.sourceId && !sb.alive && state.participantIds.has(sb.sourceId)) {
      delete positions[sb.sourceId];
    }
  }
};

// Injected bodies (rogue mass, fragments) for the scenario scene layer to render.
export const getExtraSimBodies = (): SimBody[] =>
  current ? current.state.bodies.filter((sb) => sb.alive && sb.kind !== "body") : [];

// Monotonic-ish token that changes whenever the live body set changes (a fragment
// spawns, a body dies/merges). The scene layer watches this to re-derive its rendered
// descriptor list so debris created mid-step gets a mesh without waiting for a re-seed.
export const getRuntimeRevision = (): number => current?.state.revision ?? 0;

// Live state of a participant (e.g. the Sun) for bespoke per-scenario visuals such
// as the red-giant overlay, which tracks the Sun's swelling radius each frame.
export const getParticipant = (id: string): SimBody | null => current?.state.byId.get(id) ?? null;

export const sceneRadiusForSimBody = (sb: SimBody, mode: ScaleMode) => {
  // Borrow the planet readable-size feel without importing the full body machinery.
  if (mode === "real") {
    return (sb.radiusKm / 149_597_870.7) * 7;
  }
  // Fragments are debris — keep them small and distinct from a full rogue marker, but
  // still above a visibility floor so a swarm reads as a ring rather than vanishing.
  if (sb.kind === "fragment") {
    return Math.min(Math.max(sb.radiusKm / 90_000, 0.05), 0.34);
  }
  return Math.min(Math.max(sb.radiusKm / 90_000, 0.18), 0.9);
};

// Drain the list of data-bodies consumed since the last call (for the scene to hide).
export const drainConsumed = (): string[] => {
  if (!current || current.state.newlyConsumed.length === 0) {
    return [];
  }
  const consumed = current.state.newlyConsumed;
  current.state.newlyConsumed = [];
  return consumed;
};

export const getElapsedSimSeconds = () => current?.state.elapsedSimSeconds ?? 0;
export const isThrottled = () => current?.state.throttled ?? false;
export const getEventCount = () => current?.state.events.length ?? 0;
export const getLatestEvent = () => {
  const events = current?.state.events;
  return events && events.length > 0 ? events[events.length - 1] : null;
};
