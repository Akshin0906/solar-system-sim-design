// Editable rocket catalog for the educational launch MVP.
//
// This is the single source of truth for rocket profiles. Values are tuned for
// clear, comparable educational behaviour using the simple speed-profile flight
// model in `flightModel.ts`. They are NOT mission-design numbers. See ROCKETS.md
// for the assumptions behind each profile and what is intentionally simplified.
//
// Confidence labels:
//   real        - hardware that has flown; performance grounded in public figures.
//   estimated   - real or near-term hardware, but this outbound cruise profile is approximated.
//   speculative - conceptual propulsion; numbers illustrate intent, not measured performance.

export type RocketCategory = "existing" | "nearFuture" | "theoretical";
export type SourceConfidence = "real" | "estimated" | "speculative";

export type RocketProfile = {
  id: string;
  name: string;
  category: RocketCategory;
  sourceConfidence: SourceConfidence;
  blurb: string;
  accentColor: string;
  // Simple speed-profile flight model (v1). All physical, scale-independent.
  initialSpeedKmS: number; // speed at the start of the tracked outbound cruise
  maxSpeedKmS: number; // ceiling the speed profile will not exceed
  accelerationMS2: number; // applied while the engine is burning
  burnDurationSeconds: number; // how long the engine accelerates before coasting
};

export const rocketCatalog: RocketProfile[] = [
  {
    id: "saturn-v",
    name: "Saturn V",
    category: "existing",
    sourceConfidence: "real",
    blurb: "Apollo-era heavy lifter. Trans-lunar injection class departure speed.",
    accentColor: "#d9ad69",
    initialSpeedKmS: 2,
    maxSpeedKmS: 11.0,
    accelerationMS2: 22,
    burnDurationSeconds: 420,
  },
  {
    id: "falcon-heavy",
    name: "Falcon Heavy",
    category: "existing",
    sourceConfidence: "real",
    blurb: "Reusable heavy lift. Can push light payloads to Earth-escape speeds.",
    accentColor: "#cdd3d8",
    initialSpeedKmS: 2,
    maxSpeedKmS: 11.5,
    accelerationMS2: 24,
    burnDurationSeconds: 430,
  },
  {
    id: "starship",
    name: "Starship",
    category: "existing",
    sourceConfidence: "estimated",
    blurb: "Fully reusable super-heavy. Departure speed assumes on-orbit refuelling.",
    accentColor: "#9fb9c4",
    initialSpeedKmS: 1.5,
    maxSpeedKmS: 12.0,
    accelerationMS2: 22,
    burnDurationSeconds: 520,
  },
  {
    id: "sls",
    name: "SLS Block 1",
    category: "existing",
    sourceConfidence: "real",
    blurb: "NASA's Artemis launch vehicle. Trans-lunar injection class departure.",
    accentColor: "#e0c08a",
    initialSpeedKmS: 2,
    maxSpeedKmS: 11.2,
    accelerationMS2: 22,
    burnDurationSeconds: 430,
  },
  {
    id: "nuclear-thermal",
    name: "Nuclear Thermal Rocket",
    category: "nearFuture",
    sourceConfidence: "estimated",
    blurb: "NERVA-class thermal rocket. Higher exhaust speed enables a longer, faster burn.",
    accentColor: "#9cd29a",
    initialSpeedKmS: 3,
    maxSpeedKmS: 22,
    accelerationMS2: 9,
    burnDurationSeconds: 2_400,
  },
  {
    id: "ion-probe",
    name: "Ion Drive Probe",
    category: "existing",
    sourceConfidence: "estimated",
    blurb: "Solar-electric ion thruster. Tiny thrust, but it builds speed over months.",
    accentColor: "#8fc7cc",
    initialSpeedKmS: 0.5,
    maxSpeedKmS: 40,
    accelerationMS2: 0.0006,
    burnDurationSeconds: 30_000_000, // ~0.95 years of continuous thrust
  },
  {
    id: "fusion-drive",
    name: "Fusion Drive Concept",
    category: "theoretical",
    sourceConfidence: "speculative",
    blurb: "Notional fusion engine. Sustained high thrust toward ~1% of light speed.",
    accentColor: "#c98ad9",
    initialSpeedKmS: 5,
    maxSpeedKmS: 3_000,
    accelerationMS2: 2.5,
    burnDurationSeconds: 6_000_000, // ~69 days
  },
  {
    id: "solar-sail",
    name: "Solar Sail Concept",
    category: "nearFuture",
    sourceConfidence: "speculative",
    blurb: "Reflective sail pushed by sunlight. Slow to build speed, no propellant.",
    accentColor: "#e7d9a6",
    initialSpeedKmS: 0.3,
    maxSpeedKmS: 70,
    accelerationMS2: 0.0009,
    burnDurationSeconds: 60_000_000, // ~1.9 years of sunlight pressure
  },
];

export const rocketsById = new Map(rocketCatalog.map((rocket) => [rocket.id, rocket]));

export const defaultRocketId = rocketCatalog[0].id;

export const confidenceLabel: Record<SourceConfidence, string> = {
  real: "Real",
  estimated: "Estimated",
  speculative: "Speculative",
};

export const categoryLabel: Record<RocketCategory, string> = {
  existing: "Existing",
  nearFuture: "Near future",
  theoretical: "Theoretical",
};
