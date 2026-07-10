export type RocketHardwareKind = "launch-vehicle" | "in-space-propulsion";

export type RocketHardwareStatus =
  | "retired-flight-proven"
  | "operational-flight-proven"
  | "flight-proven"
  | "development-flight-test"
  | "ground-tested"
  | "flight-demonstrated"
  | "mission-complete"
  | "concept-study";

export type DirectCurveConfidence = "illustrative" | "notional";

export type RocketReference = {
  title: string;
  publisher: "NASA" | "SpaceX";
  url: string;
  publishedOrUpdated: string;
  supports: string;
};

// Primary-source references behind hardware maturity and the small number of
// published performance benchmarks exposed by the catalog. These sources do
// not validate the app's direct/free 1-D curves or certify a mission design.
export const rocketReferences = {
  "nasa-saturn-v-capability": {
    title: "NASA Rockets Educator Guide — Saturn V capability",
    publisher: "NASA",
    url: "https://www.nasa.gov/sites/default/files/atoms/files/rockets-educator-guide-20.pdf",
    publishedOrUpdated: "2020 edition",
    supports: "117,900 kg to low Earth orbit and 40,800 kg toward the Moon.",
  },
  "spacex-falcon-heavy-overview": {
    title: "Falcon Heavy overview",
    publisher: "SpaceX",
    url: "https://www.spacex.com/vehicles/falcon-heavy",
    publishedOrUpdated: "accessed 2026-07-10",
    supports: "Operational vehicle identity and advertised LEO and Mars payload figures.",
  },
  "nasa-uranus-orbiter-study": {
    title: "Uranus Orbiter and Probe mission study",
    publisher: "NASA",
    url: "https://science.nasa.gov/wp-content/uploads/2023/10/uranus-orbiter-and-probe.pdf",
    publishedOrUpdated: "2021 mission concept study",
    supports: "A mission-specific Falcon Heavy Expendable capability point at C3 29.36 km²/s².",
  },
  "spacex-starship-flight-12": {
    title: "Starship's twelfth flight test",
    publisher: "SpaceX",
    url: "https://www.spacex.com/launches/starship-flight-12",
    publishedOrUpdated: "2026-05-22",
    supports: "Developmental flight-test status; it is not an operational payload benchmark.",
  },
  "nasa-sls-reference-guide": {
    title: "SLS Reference Guide — Block 1",
    publisher: "NASA",
    url: "https://www.nasa.gov/wp-content/uploads/2022/03/sls_reference_guide_2022_web.pdf",
    publishedOrUpdated: "2022",
    supports: "95 t to LEO and more than 27 t to trans-lunar injection for Block 1.",
  },
  "nasa-artemis-i-performance": {
    title: "Analysis confirms successful Artemis I Moon mission",
    publisher: "NASA",
    url: "https://www.nasa.gov/missions/artemis/analysis-confirms-successful-artemis-i-moon-mission-reviews-continue/",
    publishedOrUpdated: "2023-03-09",
    supports: "SLS Block 1 flight performance and successful trans-lunar injection.",
  },
  "nasa-nerva-history": {
    title: "Rocket Systems Area — Nuclear Rockets",
    publisher: "NASA",
    url: "https://www.nasa.gov/rocket-systems-area-nuclear-rockets/",
    publishedOrUpdated: "2025",
    supports: "NERVA ground-test history and cancellation before a flight test.",
  },
  "nasa-dawn-ion-propulsion": {
    title: "Dawn ion propulsion",
    publisher: "NASA",
    url: "https://science.nasa.gov/mission/dawn/technology/ion-propulsion/",
    publishedOrUpdated: "2024",
    supports: "Flight use of long-duration, low-thrust ion propulsion on Dawn.",
  },
  "nasa-fusion-driven-rocket": {
    title: "The Fusion Driven Rocket",
    publisher: "NASA",
    url: "https://www.nasa.gov/general/the-fusion-driven-rocket-nuclear-propulsion-through-direct-conversion-of-fusion-energy/",
    publishedOrUpdated: "2019-03-25",
    supports: "NIAC concept-study status, not flight hardware.",
  },
  "nasa-solar-sail-state-of-art": {
    title: "Small Spacecraft Technology State of the Art — In-Space Propulsion",
    publisher: "NASA",
    url: "https://www.nasa.gov/smallsat-institute/sst-soa/in-space_propulsion/",
    publishedOrUpdated: "2026",
    supports: "Solar-sail flight demonstrations including NanoSail-D2 and LightSail 2.",
  },
} as const satisfies Record<string, RocketReference>;

export type RocketReferenceId = keyof typeof rocketReferences;

export type RocketCapabilityBenchmark = {
  id: string;
  label: string;
  payloadKg: number;
  payloadRelation: "approximately" | "at-least" | "up-to" | "modeled";
  destination: string;
  configuration: string;
  c3Km2S2?: number;
  basis: "published-capability" | "mission-study";
  sourceId: RocketReferenceId;
  caveat: string;
};

export const hardwareKindLabel: Record<RocketHardwareKind, string> = {
  "launch-vehicle": "Launch vehicle",
  "in-space-propulsion": "In-space propulsion",
};

export const hardwareStatusLabel: Record<RocketHardwareStatus, string> = {
  "retired-flight-proven": "Hardware: flown, retired",
  "operational-flight-proven": "Hardware: operational",
  "flight-proven": "Hardware: flight proven",
  "development-flight-test": "Hardware: flight test",
  "ground-tested": "Hardware: ground tested",
  "flight-demonstrated": "Technology: flight demo",
  "mission-complete": "Technology: mission proven",
  "concept-study": "Hardware: concept study",
};

export const hardwareStatusTone: Record<RocketHardwareStatus, "proven" | "development" | "concept"> = {
  "retired-flight-proven": "proven",
  "operational-flight-proven": "proven",
  "flight-proven": "proven",
  "development-flight-test": "development",
  "ground-tested": "development",
  "flight-demonstrated": "proven",
  "mission-complete": "proven",
  "concept-study": "concept",
};

export const directCurveConfidenceLabel: Record<DirectCurveConfidence, string> = {
  illustrative: "Curve: illustrative",
  notional: "Curve: notional",
};

const payloadRelationPrefix: Record<RocketCapabilityBenchmark["payloadRelation"], string> = {
  approximately: "≈",
  "at-least": ">",
  "up-to": "up to",
  modeled: "modeled",
};

export const formatCapabilityBenchmark = (benchmark: RocketCapabilityBenchmark) => {
  const payload = `${payloadRelationPrefix[benchmark.payloadRelation]} ${benchmark.payloadKg.toLocaleString("en-US")} kg`;
  const energy = benchmark.c3Km2S2 === undefined ? "" : ` at C3 ${benchmark.c3Km2S2.toFixed(2)} km²/s²`;
  return `${payload} to ${benchmark.destination}${energy}`;
};
