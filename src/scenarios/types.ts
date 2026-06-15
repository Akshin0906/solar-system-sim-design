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
  // Optional presentation hints read by the scene's ScenarioLayer. They never touch the
  // physics — only how (and whether) the generic layer draws this body.
  //   "marker"   — glowing sphere + name label (default for rogues/interlopers).
  //   "fragment" — small debris speck, no label (default for kind:"fragment").
  //   "custom"   — skip the generic layer entirely; a bespoke overlay owns this visual
  //                (e.g. the black hole's accretion disk tracks it via getParticipant).
  renderHint?: "marker" | "fragment" | "custom";
  label?: string; // scene label text when renderHint is "marker"
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
  // Bumped whenever the live body set changes — a body is added (rogue, fragment) or
  // dies (merged, shattered, consumed). The scene watches this to re-derive its
  // rendered descriptor list so mid-run debris gets meshes without a re-seed.
  revision: number;
  // Debris controls. shatterEnabled gates the whole break-up path off for scenarios that
  // only want clean merges (red giant engulfment, the freefall oracle) so their physics —
  // and the tests that pin it — are untouched. fragmentCap bounds simultaneously-live
  // fragments; when an event would exceed it the excess mass coalesces into the largest
  // fragments and fragmentCapHit records the cap so the panel can say so (0 = never hit).
  shatterEnabled: boolean;
  fragmentCap: number;
  fragmentCapHit: number;
  // Monotonic counter for unique fragment ids. Lives on state (not a module global) so
  // every run starts at 0 and stays deterministic / resumable.
  fragmentSeq: number;
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
