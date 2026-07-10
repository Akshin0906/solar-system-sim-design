import type {
  DirectCurveConfidence,
  RocketCapabilityBenchmark,
  RocketHardwareKind,
  RocketHardwareStatus,
  RocketReferenceId,
} from "./rocketEvidence";

// This catalog deliberately keeps three independent claims separate:
// 1. `hardware` says what has actually flown, been tested, or only been studied.
// 2. `directCurve` drives only the illustrative direct/free 1-D preview.
// 3. `capabilityBenchmarks` preserves a few sourced payload/energy facts, but
//    never decides whether a Hohmann or Lambert mission is feasible.
//
// Physical transfer paths and their C3/delta-v requirements do not consume the
// direct curve or silently change when a different catalog entry is selected.

export type RocketProfile = {
  id: string;
  name: string;
  summary: string;
  accentColor: string;
  hardware: {
    kind: RocketHardwareKind;
    status: RocketHardwareStatus;
    note: string;
    sourceIds: readonly RocketReferenceId[];
  };
  directCurve: {
    confidence: DirectCurveConfidence;
    note: string;
    initialSpeedKmS: number;
    maxSpeedKmS: number;
    accelerationMS2: number;
    burnDurationSeconds: number;
  };
  capabilityBenchmarks: readonly RocketCapabilityBenchmark[];
};

export const rocketCatalog: RocketProfile[] = [
  {
    id: "saturn-v",
    name: "Saturn V",
    summary: "Apollo-era launch vehicle, retained here as a historical identity and payload benchmark.",
    accentColor: "#d9ad69",
    hardware: {
      kind: "launch-vehicle",
      status: "retired-flight-proven",
      note: "Saturn V flew Apollo and Skylab missions; the displayed direct curve is not a reconstruction of its stages.",
      sourceIds: ["nasa-saturn-v-capability"],
    },
    directCurve: {
      confidence: "illustrative",
      note: "Comparison-only outbound curve; it is not Saturn V ascent, staging, payload, or TLI performance.",
      initialSpeedKmS: 2,
      maxSpeedKmS: 11,
      accelerationMS2: 22,
      burnDurationSeconds: 420,
    },
    capabilityBenchmarks: [
      {
        id: "saturn-v-leo",
        label: "Published LEO capability",
        payloadKg: 117_900,
        payloadRelation: "approximately",
        destination: "low Earth orbit",
        configuration: "Saturn V",
        basis: "published-capability",
        sourceId: "nasa-saturn-v-capability",
        caveat: "A historical mass-to-orbit figure, not a C3 curve or a mission feasibility result.",
      },
      {
        id: "saturn-v-lunar",
        label: "Published lunar capability",
        payloadKg: 40_800,
        payloadRelation: "approximately",
        destination: "a lunar trajectory",
        configuration: "Saturn V",
        basis: "published-capability",
        sourceId: "nasa-saturn-v-capability",
        caveat: "The source describes payload toward the Moon; it is not interchangeable with arbitrary interplanetary C3.",
      },
    ],
  },
  {
    id: "falcon-heavy",
    name: "Falcon Heavy",
    summary: "Operational heavy-lift launch vehicle with published payload figures and one contextual NASA C3 study point.",
    accentColor: "#cdd3d8",
    hardware: {
      kind: "launch-vehicle",
      status: "operational-flight-proven",
      note: "Falcon Heavy is operational; recovery choice, launch site, trajectory, fairing, and margins change performance.",
      sourceIds: ["spacex-falcon-heavy-overview", "nasa-uranus-orbiter-study"],
    },
    directCurve: {
      confidence: "illustrative",
      note: "Comparison-only outbound curve; it is not a Falcon Heavy staging simulation or provider performance curve.",
      initialSpeedKmS: 2,
      maxSpeedKmS: 11.5,
      accelerationMS2: 24,
      burnDurationSeconds: 430,
    },
    capabilityBenchmarks: [
      {
        id: "falcon-heavy-leo",
        label: "Advertised LEO capability",
        payloadKg: 63_800,
        payloadRelation: "up-to",
        destination: "low Earth orbit",
        configuration: "Falcon Heavy; provider headline figure",
        basis: "published-capability",
        sourceId: "spacex-falcon-heavy-overview",
        caveat: "Headline payload is configuration- and mission-dependent and is not a deep-space performance curve.",
      },
      {
        id: "falcon-heavy-mars",
        label: "Advertised Mars payload",
        payloadKg: 16_800,
        payloadRelation: "up-to",
        destination: "a Mars transfer",
        configuration: "Falcon Heavy; provider headline figure",
        basis: "published-capability",
        sourceId: "spacex-falcon-heavy-overview",
        caveat: "The provider does not expose the trajectory assumptions here; do not map this scalar onto an arbitrary window.",
      },
      {
        id: "falcon-heavy-uop-c3",
        label: "NASA Uranus study point",
        payloadKg: 8_345,
        payloadRelation: "modeled",
        destination: "the study injection state",
        configuration: "Falcon Heavy Expendable; 2031 Uranus mission concept",
        c3Km2S2: 29.36,
        basis: "mission-study",
        sourceId: "nasa-uranus-orbiter-study",
        caveat: "One mission-study point, not a universal payload curve or proof that another trajectory closes.",
      },
    ],
  },
  {
    id: "starship",
    name: "Starship",
    summary: "Developmental reusable launch system represented without an operational payload benchmark.",
    accentColor: "#9fb9c4",
    hardware: {
      kind: "launch-vehicle",
      status: "development-flight-test",
      note: "Starship is in an active flight-test program; this catalog does not treat projected payload as demonstrated capability.",
      sourceIds: ["spacex-starship-flight-12"],
    },
    directCurve: {
      confidence: "notional",
      note: "A fictional comparison curve. It does not model refueling, staging, payload, recovery reserve, or a flown mission.",
      initialSpeedKmS: 1.5,
      maxSpeedKmS: 12,
      accelerationMS2: 22,
      burnDurationSeconds: 520,
    },
    capabilityBenchmarks: [],
  },
  {
    id: "sls",
    name: "SLS Block 1",
    summary: "NASA deep-space launch vehicle with one completed integrated flight and published Block 1 payload figures.",
    accentColor: "#e0c08a",
    hardware: {
      kind: "launch-vehicle",
      status: "flight-proven",
      note: "SLS Block 1 flew Artemis I and completed its trans-lunar injection; configuration-specific planning is still required.",
      sourceIds: ["nasa-sls-reference-guide", "nasa-artemis-i-performance"],
    },
    directCurve: {
      confidence: "illustrative",
      note: "Comparison-only outbound curve; it is not the Block 1 core/ICPS burn sequence or an Orion trajectory.",
      initialSpeedKmS: 2,
      maxSpeedKmS: 11.2,
      accelerationMS2: 22,
      burnDurationSeconds: 430,
    },
    capabilityBenchmarks: [
      {
        id: "sls-block-1-leo",
        label: "Published Block 1 LEO capability",
        payloadKg: 95_000,
        payloadRelation: "at-least",
        destination: "low Earth orbit",
        configuration: "SLS Block 1 crew configuration",
        basis: "published-capability",
        sourceId: "nasa-sls-reference-guide",
        caveat: "A configuration-specific mass figure, not an arbitrary deep-space payload result.",
      },
      {
        id: "sls-block-1-tli",
        label: "Published Block 1 TLI capability",
        payloadKg: 27_000,
        payloadRelation: "at-least",
        destination: "trans-lunar injection",
        configuration: "SLS Block 1 crew configuration",
        basis: "published-capability",
        sourceId: "nasa-sls-reference-guide",
        caveat: "TLI capability does not imply the same payload at another C3, declination, fairing, or mission profile.",
      },
    ],
  },
  {
    id: "nuclear-thermal",
    name: "Nuclear Thermal Propulsion",
    summary: "NERVA-lineage in-space propulsion technology, ground-tested but never flown.",
    accentColor: "#9cd29a",
    hardware: {
      kind: "in-space-propulsion",
      status: "ground-tested",
      note: "NERVA engines were ground-tested; the program ended before an engine flight test.",
      sourceIds: ["nasa-nerva-history"],
    },
    directCurve: {
      confidence: "notional",
      note: "A fictional sustained-burn comparison curve, not a NERVA test result or a complete vehicle design.",
      initialSpeedKmS: 3,
      maxSpeedKmS: 22,
      accelerationMS2: 9,
      burnDurationSeconds: 2_400,
    },
    capabilityBenchmarks: [],
  },
  {
    id: "ion-probe",
    name: "Ion Propulsion Probe",
    summary: "Flight-proven low-thrust propulsion pattern inspired by missions such as Dawn.",
    accentColor: "#8fc7cc",
    hardware: {
      kind: "in-space-propulsion",
      status: "mission-complete",
      note: "Dawn used ion propulsion successfully; this entry is not a model of Dawn's mass, power, thrust schedule, or trajectory.",
      sourceIds: ["nasa-dawn-ion-propulsion"],
    },
    directCurve: {
      confidence: "illustrative",
      note: "Shows the low-thrust/long-duration pattern only; its acceleration is not reconstructed from a specific spacecraft.",
      initialSpeedKmS: 0.5,
      maxSpeedKmS: 18.5,
      accelerationMS2: 0.0006,
      burnDurationSeconds: 30_000_000,
    },
    capabilityBenchmarks: [],
  },
  {
    id: "fusion-drive",
    name: "Fusion Drive Concept",
    summary: "A speculative in-space propulsion concept, not an existing engine or spacecraft.",
    accentColor: "#c98ad9",
    hardware: {
      kind: "in-space-propulsion",
      status: "concept-study",
      note: "NASA NIAC studied fusion-driven rocket concepts; no flight article establishes this profile.",
      sourceIds: ["nasa-fusion-driven-rocket"],
    },
    directCurve: {
      confidence: "notional",
      note: "A fictional high-energy comparison curve; no mass ratio, reactor, radiator, propellant, or power balance is modeled.",
      initialSpeedKmS: 5,
      maxSpeedKmS: 3_000,
      accelerationMS2: 2.5,
      burnDurationSeconds: 6_000_000,
    },
    capabilityBenchmarks: [],
  },
  {
    id: "solar-sail",
    name: "Solar Sail Craft",
    summary: "Flight-demonstrated propulsion technology paired with a deliberately notional deep-space comparison curve.",
    accentColor: "#e7d9a6",
    hardware: {
      kind: "in-space-propulsion",
      status: "flight-demonstrated",
      note: "Solar sails have flown, but acceleration depends strongly on sail loading, attitude, and distance from the Sun.",
      sourceIds: ["nasa-solar-sail-state-of-art"],
    },
    directCurve: {
      confidence: "notional",
      note: "A constant-acceleration fiction; real solar-pressure acceleration varies with geometry and solar distance.",
      initialSpeedKmS: 0.3,
      maxSpeedKmS: 54.3,
      accelerationMS2: 0.0009,
      burnDurationSeconds: 60_000_000,
    },
    capabilityBenchmarks: [],
  },
];

export const rocketsById = new Map(rocketCatalog.map((rocket) => [rocket.id, rocket]));

export const defaultRocketId = rocketCatalog[0].id;
