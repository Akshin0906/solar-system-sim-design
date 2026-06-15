import { AU_KM, DAY_SECONDS } from "../data/constants";
import type { CelestialBody } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { normalizeVec3, subVec3, vectorLength } from "../simulation/vec3";
import { DEFAULT_FRAGMENT_CAP, addSimBody, enableDebris, resolveContact, tidalDisrupt } from "./integrator";
import type { DoomsdayScenario, SimBody } from "./types";

// GM of the Sun (km^3/s^2) — used to express a rogue interloper's mass in solar masses.
const SUN_MU = 132_712_440_018;
// The Sun's photospheric radius today; the red-giant swell grows from here.
const SUN_RADIUS_KM = 696_340;

// --- Rogue interloper -------------------------------------------------------
// The injected interloper's integrator id. The bespoke Interloper overlay tracks it.
export const INTERLOPER_ID = "interloper";

// Interloper presets. `massSolar` is the characteristic mass for the class (the Mass
// slider scales it); `captureRadiusKm` is the integrator collision radius where infalling
// matter is swallowed. `render` picks who draws it: "custom" hands it to the Interloper
// overlay (event horizon + accretion, or a glowing star); "marker" leaves it to the
// generic ScenarioLayer. The compact types have a capture radius far inside their Roche
// limit, so planets tidally shred into a stream before being swallowed; the star's Roche
// limit sits inside its surface, so it engulfs planets whole instead.
export const INTERLOPER_TYPES = [
  { value: 0, label: "Black hole", massSolar: 8, captureRadiusKm: 120_000, color: "#05050a", render: "custom" as const },
  { value: 1, label: "Rogue star", massSolar: 0.8, captureRadiusKm: 620_000, color: "#ffd49a", render: "custom" as const },
  { value: 2, label: "Rogue planet", massSolar: 0.02, captureRadiusKm: 75_000, color: "#6f5d92", render: "marker" as const },
];

export const interloperType = (index: number) =>
  INTERLOPER_TYPES[Math.max(0, Math.min(INTERLOPER_TYPES.length - 1, Math.round(index)))];

// --- Asteroid / comet impact ------------------------------------------------
export const IMPACTOR_ID = "impactor";

// Planets an impactor can be aimed at (index = the target param's value). The special
// value -1 means "whatever body is currently selected" (falling back to Earth).
const IMPACT_TARGETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
const IMPACT_TARGET_SELECTED = -1;
const GRAV_CONST_KM = 6.674e-20; // G in km^3 kg^-1 s^-2, to turn a size+density into μ

export const impactTargetId = (value: number, bodiesById: Map<string, CelestialBody>): string => {
  if (Math.round(value) === IMPACT_TARGET_SELECTED) {
    const selected = useSelectionStore.getState().selectedId;
    return bodiesById.get(selected)?.type === "planet" ? selected : "earth";
  }
  return IMPACT_TARGETS[Math.max(0, Math.min(IMPACT_TARGETS.length - 1, Math.round(value)))] ?? "earth";
};

const impactorMu = (radiusKm: number, isComet: boolean) => {
  const densityKgM3 = isComet ? 600 : 2500; // icy comet vs rocky asteroid
  const massKg = (4 / 3) * Math.PI * (radiusKm * 1000) ** 3 * densityKgM3;
  return GRAV_CONST_KM * massKg;
};

// --- Planet–planet collision ------------------------------------------------
// Segmented-control options for the inner worlds (values index into IMPACT_TARGETS).
const PLANET_OPTIONS = [
  { value: 0, label: "Mercury" },
  { value: 1, label: "Venus" },
  { value: 2, label: "Earth" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Jupiter" },
];
const planetId = (value: number) => IMPACT_TARGETS[Math.max(0, Math.min(IMPACT_TARGETS.length - 1, Math.round(value)))];

// Built-in scenarios. The framework slice ships two:
//   1. "freefall" — the correctness oracle. Seeding is right iff the real system
//      stays ~stable here, because Kepler and N-body agree over short spans.
//   2. "rogue-mass" — proves injected dynamic bodies + real perturbation + the
//      collision/ejection path that every catastrophe will reuse.
// The four headline catastrophes (red giant, rogue black hole, impact, collision)
// drop into this same array as content on top of the proven framework.
export const SCENARIOS: DoomsdayScenario[] = [
  {
    id: "red-giant",
    name: "Sun becomes a red giant",
    tagline: "The Sun swells, cools to deep red, and swallows the inner planets.",
    science: {
      realTimescale: "≈5 billion years from now — the swell itself unfolds over roughly a billion years.",
      summary:
        "As the Sun exhausts its core hydrogen it inflates toward ~200× its radius and its surface cools to a deep orange-red. The expanding photosphere reaches out past the inner planets.",
      watch:
        "Mercury and Venus are swallowed first; whether Earth survives is genuinely uncertain. Push 'Final size' past 1 AU to engulf Earth, or keep it lower to spare it.",
    },
    params: [
      { key: "swellYears", label: "Swell time", min: 2, max: 30, step: 1, default: 6, unit: "yr", help: "Scenario-time for the Sun to reach full size." },
      { key: "finalRadiusAu", label: "Final size", min: 0.4, max: 1.5, step: 0.05, default: 1.1, unit: "AU", help: "How far the surface expands. Past 1 AU it reaches Earth's orbit." },
    ],
    defaultTimeScaleDaysPerSec: 250,
    // Grow the Sun's physical radius along an accelerating curve. The integrator's
    // collision detection does the rest: when the swelling surface crosses a planet's
    // orbit, they merge and the planet is consumed — real engulfment, no extra code.
    drive: ({ state, params }) => {
      const sun = state.byId.get("sun");
      if (!sun) {
        return;
      }
      const finalKm = Math.max((params.finalRadiusAu ?? 1.1) * AU_KM, SUN_RADIUS_KM);
      const swellSeconds = Math.max(params.swellYears ?? 6, 0.1) * 365.256 * DAY_SECONDS;
      const progress = Math.min(state.elapsedSimSeconds / swellSeconds, 1);
      const eased = Math.pow(progress, 1.6); // slow subgiant start, accelerating ascent
      sun.radiusKm = SUN_RADIUS_KM + (finalKm - SUN_RADIUS_KM) * eased;
    },
  },
  {
    id: "freefall",
    name: "Free N-body drift",
    tagline: "The real, mutually gravitating solar system — no catastrophe, just honest gravity.",
    science: {
      realTimescale: "Always on — these perturbations play out over millions of years in reality.",
      summary:
        "Hands the Sun and eight planets to a live Newtonian integrator seeded with their true masses and J2000 velocities. Nothing is scripted; every motion is real gravity.",
      watch:
        "The Sun traces a small loop around the system's barycentre as Jupiter tugs on it. Planetary orbits hold steady over short spans — proof the handoff from the Kepler solver is exact.",
    },
    params: [],
    defaultTimeScaleDaysPerSec: 30,
  },
  {
    id: "rogue-mass",
    name: "Rogue mass flyby",
    tagline: "A wandering massive body falls through the system and tears the orbits apart.",
    science: {
      realTimescale: "Vanishingly rare — a stellar-mass interloper crosses the planets perhaps once in billions of years.",
      summary:
        "Injects a massive interloper on an inbound trajectory and lets real gravity do the rest. Planets are flung onto new orbits; close passes merge or eject them.",
      watch:
        "Track the giant planets as the intruder sweeps through — some are slingshotted onto wild ellipses, others escape the Sun entirely. Raise the mass for total chaos.",
    },
    params: [
      { key: "massSolar", label: "Intruder mass", min: 0.05, max: 2, step: 0.05, default: 0.4, unit: "M☉" },
      { key: "speedKmS", label: "Approach speed", min: 2, max: 60, step: 1, default: 18, unit: "km/s" },
      { key: "impactParamAu", label: "Miss distance", min: 0, max: 20, step: 0.5, default: 6, unit: "AU", help: "Perpendicular offset of its path from the Sun." },
    ],
    defaultTimeScaleDaysPerSec: 20,
    seed: ({ state, params }) => {
      const massSolar = params.massSolar ?? 0.4;
      const speed = params.speedKmS ?? 18;
      const impact = (params.impactParamAu ?? 6) * AU_KM;
      // Falls in along -X from far away, offset along +Z by the miss distance, so its
      // closest approach to the Sun line is exactly that distance.
      const startX = 80 * AU_KM;
      addSimBody(state, {
        id: "rogue-mass",
        kind: "rogue",
        posKm: [startX, 0, impact],
        velKmS: [-speed, 0, 0],
        muKm3S2: massSolar * SUN_MU,
        radiusKm: 60_000,
        color: "#b46bff",
        alive: true,
      });
    },
  },
  {
    id: "rogue-blackhole",
    name: "Rogue black hole",
    tagline: "A wandering compact object falls through the system, shredding and swallowing worlds.",
    science: {
      realTimescale:
        "A stellar-mass interloper crosses the planetary region perhaps once in many billions of years — the Sun has likely never had one this close.",
      summary:
        "Injects a compact interloper and lets real gravity act. Planets are slingshotted onto wild orbits; any that crosses the interloper's Roche limit is torn into a tidal debris stream, and matter falling past the capture radius is swallowed — feeding a brightening accretion disk.",
      watch:
        "Drop the miss distance below ~0.5 AU to send a world inside the Roche limit and watch it unravel into a stream. A black hole shreds; a rogue star (its Roche limit buried inside its surface) swallows planets whole instead. Some survivors are flung out of the system entirely.",
    },
    params: [
      {
        key: "interloperType",
        label: "Interloper",
        default: 0,
        options: INTERLOPER_TYPES.map((type) => ({ value: type.value, label: type.label })),
        help: "Black hole and rogue star are drawn with a bespoke visual; a rogue planet is a dark marker.",
      },
      { key: "massMult", label: "Mass", min: 0.25, max: 4, step: 0.05, default: 1, unit: "×", help: "Scales the interloper's characteristic mass for its class." },
      { key: "speedKmS", label: "Approach speed", min: 5, max: 140, step: 1, default: 45, unit: "km/s" },
      { key: "missDistanceAu", label: "Miss distance", min: 0, max: 12, step: 0.25, default: 1.5, unit: "AU", help: "Closest approach to the Sun. Lower it to send a planet inside the Roche limit." },
      { key: "fragmentCap", label: "Debris limit", min: 8, max: 60, step: 2, default: 40, unit: "shards", help: "Max simultaneous debris shards; beyond it the rest coalesce into the largest." },
    ],
    defaultTimeScaleDaysPerSec: 50,
    seed: ({ state, params }) => {
      const type = interloperType(params.interloperType ?? 0);
      const massSolar = type.massSolar * (params.massMult ?? 1);
      const speed = params.speedKmS ?? 45;
      const miss = (params.missDistanceAu ?? 1.5) * AU_KM;
      enableDebris(state, params.fragmentCap ?? DEFAULT_FRAGMENT_CAP);
      // Falls in along -X from just beyond Neptune, offset along +Z by the miss distance,
      // so its closest approach to the Sun line is exactly that distance. Starting at ~32 AU
      // keeps the wait before the encounter short while still arriving from outside.
      const body: SimBody = {
        id: INTERLOPER_ID,
        kind: "rogue",
        posKm: [32 * AU_KM, 0, miss],
        velKmS: [-speed, 0, 0],
        muKm3S2: massSolar * SUN_MU,
        radiusKm: type.captureRadiusKm,
        color: type.color,
        alive: true,
        renderHint: type.render,
        label: type.label,
      };
      addSimBody(state, body);
    },
    // Tidal (Roche) disruption: each step, any intact planet that crosses the interloper's
    // Roche limit is torn into a debris stream pointing at the interloper (the tidal axis).
    // The Sun is exempt (it is swallowed whole by a direct hit, never shredded here).
    drive: ({ state }) => {
      const hole = state.byId.get(INTERLOPER_ID);
      if (!hole || !hole.alive) {
        return;
      }
      for (const sb of state.bodies) {
        if (!sb.alive || sb.kind !== "body" || sb.muKm3S2 <= 0 || sb.id === "sun") {
          continue;
        }
        const dx = sb.posKm[0] - hole.posKm[0];
        const dy = sb.posKm[1] - hole.posKm[1];
        const dz = sb.posKm[2] - hole.posKm[2];
        const distKm = Math.hypot(dx, dy, dz);
        // Rigid-body Roche limit: R_planet * (2 · μ_hole / μ_planet)^(1/3). Outside the
        // capture radius (else it is simply swallowed on contact this step).
        const rocheKm = sb.radiusKm * Math.cbrt((2 * hole.muKm3S2) / sb.muKm3S2);
        if (distKm < rocheKm && distKm > hole.radiusKm) {
          tidalDisrupt(state, sb, [-dx, -dy, -dz]);
        }
      }
    },
  },
  {
    id: "impact",
    name: "Asteroid / comet impact",
    tagline: "A small body slams into a planet — a cratering airburst, or a world-shattering blow.",
    science: {
      realTimescale:
        "City-killer impacts happen every few centuries; a Chicxulub-scale (~10 km) impactor that ended the dinosaurs lands roughly every 100 million years.",
      summary:
        "Aims an impactor at a target planet and lets it strike at real impact speed. A small fast body excavates a crater and throws ejecta; a large enough one (raise the size) exceeds the planet's binding energy and shatters it into debris.",
      watch:
        "A ~10 km impactor is the dinosaur-killer — devastating, but the planet survives. Push the size into the hundreds of km to fracture the world entirely. Comets are lower-density but faster, and trail a tail blown back from the Sun.",
    },
    params: [
      {
        key: "target",
        label: "Target",
        default: 2,
        options: [
          { value: IMPACT_TARGET_SELECTED, label: "Selected" },
          { value: 0, label: "Mercury" },
          { value: 1, label: "Venus" },
          { value: 2, label: "Earth" },
          { value: 3, label: "Mars" },
          { value: 4, label: "Jupiter" },
        ],
        help: "Which planet to aim at. ‘Selected’ uses the body you have selected (a planet).",
      },
      {
        key: "impactorType",
        label: "Impactor",
        default: 0,
        options: [
          { value: 0, label: "Asteroid" },
          { value: 1, label: "Comet" },
        ],
      },
      { key: "sizeKm", label: "Impactor size", min: 5, max: 3000, step: 5, default: 60, unit: "km", help: "Radius. ~10 km is Chicxulub-scale; hundreds of km can shatter a planet." },
      { key: "speedKmS", label: "Impact speed", min: 5, max: 72, step: 1, default: 28, unit: "km/s" },
      { key: "impactAngleDeg", label: "Impact angle", min: 10, max: 90, step: 5, default: 45, unit: "°", help: "90° is a head-on radial strike; lower angles graze in along the orbit." },
    ],
    defaultTimeScaleDaysPerSec: 8,
    seed: ({ state, params, bodiesById }) => {
      const targetId = impactTargetId(params.target ?? 2, bodiesById);
      const target = state.byId.get(targetId);
      if (!target) {
        return;
      }
      enableDebris(state, DEFAULT_FRAGMENT_CAP);
      const isComet = (params.impactorType ?? 0) === 1;
      const radiusKm = Math.max(params.sizeKm ?? 60, 1);
      const speed = params.speedKmS ?? 28;
      const angle = ((params.impactAngleDeg ?? 45) * Math.PI) / 180;
      // Approach-from direction in the orbital plane: 90° = radially outward (head-on),
      // low angle = along the prograde direction (grazing).
      const out = normalizeVec3(target.posKm);
      const along = normalizeVec3(target.velKmS);
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const fromDir = normalizeVec3([
        out[0] * s + along[0] * c,
        out[1] * s + along[1] * c,
        out[2] * s + along[2] * c,
      ]);
      const standoff = 0.3 * AU_KM;
      addSimBody(state, {
        id: IMPACTOR_ID,
        kind: "rogue",
        posKm: [
          target.posKm[0] + fromDir[0] * standoff,
          target.posKm[1] + fromDir[1] * standoff,
          target.posKm[2] + fromDir[2] * standoff,
        ],
        // Closes on the target at `speed` in the target's frame (the impact speed).
        velKmS: [
          target.velKmS[0] - fromDir[0] * speed,
          target.velKmS[1] - fromDir[1] * speed,
          target.velKmS[2] - fromDir[2] * speed,
        ],
        muKm3S2: impactorMu(radiusKm, isComet),
        radiusKm,
        color: isComet ? "#bfe6ff" : "#9a8a76",
        alive: true,
        renderHint: "marker",
        label: isComet ? "Comet" : "Asteroid",
      });
    },
    // Targeted intercept: hold the impactor on a converging course toward the planet at the
    // chosen impact speed (its frame), so the demonstration reliably lands the strike. Only
    // the impactor's aim is steered — every other body's gravity stays fully real, and the
    // impact itself (crater / shatter / ejecta) is honest Newtonian physics. Because a small,
    // fast impactor would tunnel through a tiny planet between fixed steps, the drive resolves
    // the contact itself the step before it would arrive.
    drive: ({ state, params, bodiesById }, dtSeconds) => {
      const impactor = state.byId.get(IMPACTOR_ID);
      if (!impactor || !impactor.alive) {
        return;
      }
      const target = state.byId.get(impactTargetId(params.target ?? 2, bodiesById));
      if (!target || !target.alive) {
        return;
      }
      const toTarget = subVec3(target.posKm, impactor.posKm);
      const distKm = vectorLength(toTarget);
      if (distKm <= 0) {
        return;
      }
      const speed = params.speedKmS ?? 28;
      const contactKm = impactor.radiusKm + target.radiusKm;
      if (distKm <= contactKm + speed * dtSeconds) {
        resolveContact(state, target, impactor); // strike now, before it could tunnel through
        return;
      }
      const dir = normalizeVec3(toTarget);
      impactor.velKmS = [
        target.velKmS[0] + dir[0] * speed,
        target.velKmS[1] + dir[1] * speed,
        target.velKmS[2] + dir[2] * speed,
      ];
    },
  },
  {
    id: "collision",
    name: "Planet–planet collision",
    tagline: "Two worlds are set on a collision course — a clean smash, or a moon-forming giant impact.",
    science: {
      realTimescale:
        "The leading theory for the Moon: ~4.5 billion years ago a Mars-sized world, Theia, struck the young Earth. Collisions like it shaped the early solar system but are vanishingly rare today.",
      summary:
        "Puts one world on an intercept course with another. A low closing speed is a giant impact: the two merge into a molten remnant and fling off a debris ring that partly re-accretes — the giant-impact origin of the Moon. A high closing speed shatters both into a debris cloud.",
      watch:
        "Keep the closing speed low (~6–12 km/s) to merge into a glowing molten world ringed by debris, then watch shards fall back or settle into a disk. Crank it past ~16 km/s to fracture both worlds outright.",
    },
    params: [
      { key: "mover", label: "Incoming world", default: 3, options: PLANET_OPTIONS },
      { key: "target", label: "Struck world", default: 2, options: PLANET_OPTIONS },
      { key: "approachSpeedKmS", label: "Closing speed", min: 2, max: 40, step: 1, default: 9, unit: "km/s", help: "Low → a molten merger with a re-accreting ring; high → both worlds shatter." },
      { key: "fragmentCap", label: "Debris limit", min: 8, max: 60, step: 2, default: 40, unit: "shards" },
    ],
    defaultTimeScaleDaysPerSec: 12,
    seed: ({ state, params }) => {
      enableDebris(state, params.fragmentCap ?? DEFAULT_FRAGMENT_CAP);
    },
    // Nudge the incoming world onto a converging course with the struck world at the chosen
    // closing speed, and resolve the collision the step before it would tunnel through. Only
    // the mover's course is steered; the collision (merge+ring / shatter) is honest physics.
    drive: ({ state, params }, dtSeconds) => {
      const moverId = planetId(params.mover ?? 3);
      const targetId = planetId(params.target ?? 2);
      if (moverId === targetId) {
        return;
      }
      const mover = state.byId.get(moverId);
      const target = state.byId.get(targetId);
      if (!mover || !mover.alive || !target || !target.alive) {
        return;
      }
      const toTarget = subVec3(target.posKm, mover.posKm);
      const distKm = vectorLength(toTarget);
      if (distKm <= 0) {
        return;
      }
      const speed = params.approachSpeedKmS ?? 9;
      const contactKm = mover.radiusKm + target.radiusKm;
      if (distKm <= contactKm + speed * dtSeconds) {
        resolveContact(state, target, mover);
        return;
      }
      const dir = normalizeVec3(toTarget);
      mover.velKmS = [
        target.velKmS[0] + dir[0] * speed,
        target.velKmS[1] + dir[1] * speed,
        target.velKmS[2] + dir[2] * speed,
      ];
    },
  },
];

export const scenarioById = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export const defaultParamsFor = (scenarioId: string): Record<string, number> => {
  const scenario = scenarioById.get(scenarioId);
  const params: Record<string, number> = {};
  scenario?.params.forEach((param) => {
    params[param.key] = param.default;
  });
  return params;
};
