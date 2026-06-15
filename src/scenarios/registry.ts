import { AU_KM, DAY_SECONDS } from "../data/constants";
import { addSimBody } from "./integrator";
import type { DoomsdayScenario } from "./types";

// GM of the Sun (km^3/s^2) — used to express a rogue interloper's mass in solar masses.
const SUN_MU = 132_712_440_018;
// The Sun's photospheric radius today; the red-giant swell grows from here.
const SUN_RADIUS_KM = 696_340;

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
