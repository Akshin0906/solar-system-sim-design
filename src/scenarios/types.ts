import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";

// A body participating in the live gravity integrator while a doomsday scenario is
// running. This is mutable scratch state — seeded from the Kepler solver at T+0 and
// stepped forward by real Newtonian gravity. It is intentionally NOT a CelestialBody:
// the data model stays immutable, and resetting a scenario just discards this state.
export type SimBodyKind = "body" | "rogue" | "fragment";

export type SimBody = {
  // Unique within the integrator. For data-backed bodies this equals `sourceId`.
  id: string;
  // The CelestialBody id this represents, if any (planets/sun). Undefined for
  // injected bodies (a rogue mass) and debris fragments.
  sourceId?: string;
  kind: SimBodyKind;
  posKm: Vec3; // heliocentric inertial position
  velKmS: Vec3; // heliocentric inertial velocity
  muKm3S2: number; // GM. 0 marks a massless test particle (perturbed but not perturbing).
  radiusKm: number;
  color: string;
  alive: boolean;
};

export type SimEventType = "collision" | "ejection";

// A discrete, narratable thing that happened during the sim — feeds the planetarium
// event log so the educational layer can explain what the chaos actually did.
export type SimEvent = {
  type: SimEventType;
  simSeconds: number; // scenario clock time (T+) when it happened
  aId: string;
  bId?: string;
  detail: string;
};

export type IntegratorState = {
  bodies: SimBody[];
  byId: Map<string, SimBody>;
  // CelestialBody ids handed to the integrator (Sun + planets). Everything else
  // stays on its frozen Kepler position so the integrator's cost is bounded.
  participantIds: Set<string>;
  startDateMs: number; // the frozen J2000 date the scenario was launched from
  elapsedSimSeconds: number; // the scenario's own T+ clock
  accumulatorSeconds: number; // leftover sim-time below one fixed step
  // True on the last frame whose work was capped by MAX_SUBSTEPS_PER_FRAME, i.e.
  // sim-time advanced slower than the requested scale. Surfaced, never silent.
  throttled: boolean;
  events: SimEvent[];
  ejectedIds: Set<string>; // bodies already logged as ejected (dedupe)
  // Data-body ids consumed (merged away) since the last drain. The scene reads and
  // clears this to stop rendering destroyed planets.
  newlyConsumed: string[];
};

// A sandbox control exposed as a slider in the scenario panel.
export type ScenarioParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  help?: string;
};

export type ScenarioContext = {
  state: IntegratorState;
  params: Record<string, number>;
  bodiesById: Map<string, CelestialBody>;
};

export type DoomsdayScenario = {
  id: string;
  name: string;
  tagline: string;
  // Planetarium / educational copy. Real timescales keep the spectacle honest.
  science: {
    realTimescale: string;
    summary: string;
    watch: string;
  };
  params: ScenarioParam[];
  defaultTimeScaleDaysPerSec: number;
  // Inject extra bodies or tweak state immediately after the base Kepler seed at T+0.
  seed?: (ctx: ScenarioContext) => void;
  // Per-fixed-step driver for non-gravitational effects (e.g. swelling the Sun).
  // Pure N-body scenarios leave this undefined.
  drive?: (ctx: ScenarioContext, dtSeconds: number) => void;
};
