import { DAY_SECONDS } from "../data/constants";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { getOrbitPositionKm } from "../simulation/solveOrbit";
import { addVec3 } from "../simulation/vec3";
import { computeScenePositions, scaleMoonOffset, scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import { MAX_SIM_SECONDS_PER_FRAME, advance, seedIntegrator } from "./integrator";
import { scenarioById } from "./registry";
import type { DoomsdayScenario, ImpactFx, IntegratorState, SimBody } from "./types";

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
  // The scale mode the frozen base layer was last written for. The non-participant bodies
  // (dwarfs, distant moons, belts) sit at the frozen launch date and never move during a
  // scenario, so their Kepler positions only need recomputing when the mode changes — not
  // every frame. null = not yet written.
  baseLayerMode: ScaleMode | null;
  // Real render time waiting to be handed to the physics integrator. Keeping this debt
  // outside the sim-time accumulator lets low-FPS frames catch up without allowing a
  // backgrounded tab to dump an unbounded gap into one render.
  pendingRealSeconds: number;
};

let current: Runtime | null = null;

// Absolute wall-time ceilings. The actual slice shrinks at high scenario speeds so it
// can never request more than MAX_SIM_SECONDS_PER_FRAME from the integrator. Retain one
// additional capacity-sized slice after a brief stall; discard older debt and surface
// throttling rather than turning one render into a long catch-up task.
export const SCENARIO_MAX_FRAME_ADVANCE_SECONDS = 0.25;
export const SCENARIO_MAX_REALTIME_BACKLOG_SECONDS = 0.5;
const SCENARIO_RETAINED_FRAME_SLICES = 2;

export const scenarioFrameAdvanceLimitSeconds = (timeScaleDaysPerSec: number) => {
  const simSecondsPerRealSecond = timeScaleDaysPerSec * DAY_SECONDS;
  if (!Number.isFinite(simSecondsPerRealSecond) || simSecondsPerRealSecond <= 0) {
    return 0;
  }
  return Math.min(SCENARIO_MAX_FRAME_ADVANCE_SECONDS, MAX_SIM_SECONDS_PER_FRAME / simSecondsPerRealSecond);
};

export const scenarioRealtimeBacklogLimitSeconds = (timeScaleDaysPerSec: number) =>
  Math.min(
    SCENARIO_MAX_REALTIME_BACKLOG_SECONDS,
    scenarioFrameAdvanceLimitSeconds(timeScaleDaysPerSec) * SCENARIO_RETAINED_FRAME_SLICES,
  );

export type ScenarioRuntimeStepResult = {
  advancedRealSeconds: number;
  pendingRealSeconds: number;
  droppedRealSeconds: number;
  throttled: boolean;
};

const EMPTY_STEP_RESULT: ScenarioRuntimeStepResult = {
  advancedRealSeconds: 0,
  pendingRealSeconds: 0,
  droppedRealSeconds: 0,
  throttled: false,
};

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
    baseLayerMode: null,
    pendingRealSeconds: 0,
  };
};

export const stopRuntime = () => {
  current = null;
};

// Step the live sim forward by one rendered frame's worth of time. Moderate speeds can
// preserve ordinary low-FPS deltas in full. At high speeds the wall-time slice contracts
// to the fixed physics-work ceiling: one slice runs now, one can wait for the next frame,
// and older debt is explicitly dropped. Executed fixed steps remain deterministic; only
// requested wall-clock progress slows, with `throttled` surfaced to the UI.
export const stepRuntime = (
  realDeltaSeconds: number,
  timeScaleDaysPerSec: number,
): ScenarioRuntimeStepResult => {
  if (!current) {
    return EMPTY_STEP_RESULT;
  }

  const frameAdvanceLimit = scenarioFrameAdvanceLimitSeconds(timeScaleDaysPerSec);
  if (frameAdvanceLimit <= 0) {
    const throttled = current.pendingRealSeconds > 0;
    current.state.throttled = throttled;
    return {
      advancedRealSeconds: 0,
      pendingRealSeconds: current.pendingRealSeconds,
      droppedRealSeconds: 0,
      throttled,
    };
  }

  const incomingRealSeconds = Number.isFinite(realDeltaSeconds) && realDeltaSeconds > 0 ? realDeltaSeconds : 0;
  const unboundedBacklog = current.pendingRealSeconds + incomingRealSeconds;
  const backlogLimit = scenarioRealtimeBacklogLimitSeconds(timeScaleDaysPerSec);
  const boundedBacklog = Math.min(unboundedBacklog, backlogLimit);
  const droppedRealSeconds = Math.max(unboundedBacklog - boundedBacklog, 0);
  const advancedRealSeconds = Math.min(boundedBacklog, frameAdvanceLimit);
  current.pendingRealSeconds = boundedBacklog - advancedRealSeconds;

  const simSeconds = Math.min(
    advancedRealSeconds * timeScaleDaysPerSec * DAY_SECONDS,
    MAX_SIM_SECONDS_PER_FRAME,
  );
  const { scenario, params, state, bodiesById } = current;
  const beforeStep = scenario.drive ? (dt: number) => scenario.drive!({ state, params, bodiesById }, dt) : undefined;
  advance(state, simSeconds, beforeStep);

  const throttled = state.throttled || droppedRealSeconds > 0 || current.pendingRealSeconds > 0;
  state.throttled = throttled;
  return {
    advancedRealSeconds,
    pendingRealSeconds: current.pendingRealSeconds,
    droppedRealSeconds,
    throttled,
  };
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

  // 1. Base layer: every body at the frozen launch date in the current scale mode. The
  //    frozen bodies don't move during the scenario, so this only needs recomputing when
  //    the scale mode changes — participants and their moons are overwritten every frame
  //    below regardless. This skips a full Kepler solve of the whole system per frame.
  if (current.baseLayerMode !== mode) {
    computeScenePositions(bodies, bodiesById, frozenDate, mode, positions);
    current.baseLayerMode = mode;
  }

  // 2. Overwrite live participants with integrated positions. Refuse a non-finite vector
  //    (e.g. a NaN that slipped through an extreme close pass) so the render cache — read
  //    directly by CameraRig, outside React — never gets poisoned and frames/follows a NaN.
  for (const sb of state.bodies) {
    if (sb.sourceId && sb.alive && state.participantIds.has(sb.sourceId)) {
      const scaled = scaleVectorFromSun(sb.posKm, mode);
      if (Number.isFinite(scaled[0]) && Number.isFinite(scaled[1]) && Number.isFinite(scaled[2])) {
        positions[sb.sourceId] = scaled;
      }
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

// Live bodies currently glowing (a molten giant-impact remnant or an impact afterglow),
// for the MoltenRemnant overlay to draw. Returns [] when nothing is hot.
export const getMoltenBodies = (): SimBody[] =>
  current ? current.state.bodies.filter((sb) => sb.alive && (sb.moltenHeat ?? 0) > 0.01) : [];

export const sceneRadiusForSimBody = (sb: SimBody, mode: ScaleMode) => {
  // Borrow the planet readable-size feel without importing the full body machinery.
  if (mode === "real") {
    return (sb.radiusKm / 149_597_870.7) * 7;
  }
  // Fragments are debris — keep them small and distinct from a full rogue marker, but
  // still above a visibility floor so a swarm reads as a ring rather than vanishing.
  if (sb.kind === "fragment") {
    return Math.min(Math.max(sb.radiusKm / 90_000, 0.1), 0.4);
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

// Drain transient VFX events (impact flashes, shockwaves) emitted since the last call, for
// the scene's ImpactFx layer to spawn billboards. Returns [] when there's nothing new.
export const drainImpactFx = (): ImpactFx[] => {
  if (!current || current.state.impactFx.length === 0) {
    return [];
  }
  const fx = current.state.impactFx;
  current.state.impactFx = [];
  return fx;
};

export const getElapsedSimSeconds = () => current?.state.elapsedSimSeconds ?? 0;
export const isThrottled = () => current?.state.throttled ?? false;
// The fragment cap the run has enforced (0 if debris was never coalesced). Surfaced so the
// panel can tell the user shards were merged into the largest, never silently dropped.
export const getFragmentCapHit = () => current?.state.fragmentCapHit ?? 0;
export const getLiveFragmentCount = () =>
  current ? current.state.bodies.reduce((n, sb) => n + (sb.alive && sb.kind === "fragment" ? 1 : 0), 0) : 0;
export const getLatestEvent = () => {
  const events = current?.state.events;
  return events && events.length > 0 ? events[events.length - 1] : null;
};
