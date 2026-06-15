import { J2000_EPOCH } from "./constants";
import type { CelestialBody } from "../simulation/orbitalElements";

const moonOrbitColor = "#aeb8b5";

const moon = (
  id: string,
  name: string,
  parentId: string,
  radiusKm: number,
  semiMajorAxisKm: number,
  orbitalPeriodDays: number,
  color: string,
  extras: Partial<NonNullable<CelestialBody["orbit"]>> = {},
  rotationPeriodHours?: number,
  texture?: string,
): CelestialBody => ({
  id,
  name,
  type: "moon",
  parentId,
  physical: {
    radiusKm,
    color,
    rotationPeriodHours,
    texture,
  },
  orbit: {
    semiMajorAxisKm,
    // These defaults are placeholders for visual scale, NOT real ephemeris: a moon
    // without an explicit meanAnomalyAtEpochDeg is placed at periapsis at J2000, so
    // inter-moon geometry (e.g. the Galilean Laplace resonance) is decorative. The
    // small nonzero inclination/eccentricity defaults just avoid a perfectly flat,
    // perfectly circular orbit. See DATA_SOURCES.md.
    eccentricity: extras.eccentricity ?? 0.001,
    inclinationDeg: extras.inclinationDeg ?? 0.15,
    longitudeOfAscendingNodeDeg: extras.longitudeOfAscendingNodeDeg ?? 0,
    argumentOfPeriapsisDeg: extras.argumentOfPeriapsisDeg ?? 0,
    meanAnomalyAtEpochDeg: extras.meanAnomalyAtEpochDeg ?? 0,
    orbitalPeriodDays,
    epoch: J2000_EPOCH,
    retrograde: extras.retrograde,
  },
  render: {
    showLabelDefault: false,
    orbitColor: moonOrbitColor,
    trailColor: color,
  },
});

// Moon orbit values are rounded mean elements for visual scale and relative
// motion. They intentionally avoid full satellite ephemerides and local capture
// dynamics; see DATA_SOURCES.md for source and accuracy notes.
export const majorMoons: CelestialBody[] = [
  moon("moon", "Moon", "earth", 1_737.4, 384_400, 27.3217, "#d5d0c7", {
    eccentricity: 0.0549,
    inclinationDeg: 5.145,
    longitudeOfAscendingNodeDeg: 125.08,
    argumentOfPeriapsisDeg: 318.15,
    meanAnomalyAtEpochDeg: 115.365,
  }, undefined, "textures/moon.jpg"),
  moon("io", "Io", "jupiter", 1_821.6, 421_700, 1.769, "#d6bd71", {
    eccentricity: 0.0041,
    inclinationDeg: 0.04,
    meanAnomalyAtEpochDeg: 92,
  }),
  moon("europa", "Europa", "jupiter", 1_560.8, 671_100, 3.551, "#c8c0aa", {
    eccentricity: 0.009,
    inclinationDeg: 0.47,
    meanAnomalyAtEpochDeg: 171,
  }),
  moon("ganymede", "Ganymede", "jupiter", 2_634.1, 1_070_400, 7.154, "#aaa291", {
    eccentricity: 0.0013,
    inclinationDeg: 0.2,
    meanAnomalyAtEpochDeg: 42,
  }),
  moon("callisto", "Callisto", "jupiter", 2_410.3, 1_882_700, 16.689, "#8d8275", {
    eccentricity: 0.0074,
    inclinationDeg: 0.192,
    meanAnomalyAtEpochDeg: 211,
  }),
  moon("titan", "Titan", "saturn", 2_574.7, 1_221_870, 15.945, "#d2a765", {
    eccentricity: 0.0288,
    inclinationDeg: 0.3485,
    meanAnomalyAtEpochDeg: 88,
  }),
  moon("enceladus", "Enceladus", "saturn", 252.1, 238_020, 1.37, "#e8e8df", {
    eccentricity: 0.0047,
    inclinationDeg: 0.009,
    meanAnomalyAtEpochDeg: 4,
  }),
  moon("rhea", "Rhea", "saturn", 763.8, 527_108, 4.518, "#b9b5aa", {
    eccentricity: 0.001,
    inclinationDeg: 0.345,
    meanAnomalyAtEpochDeg: 126,
  }),
  moon("iapetus", "Iapetus", "saturn", 734.5, 3_560_820, 79.32, "#9b9486", {
    eccentricity: 0.0286,
    inclinationDeg: 15.47,
    meanAnomalyAtEpochDeg: 301,
  }),
  moon("titania", "Titania", "uranus", 788.9, 435_910, 8.706, "#b6b2a9", {
    eccentricity: 0.0011,
    inclinationDeg: 0.34,
    meanAnomalyAtEpochDeg: 36,
  }),
  moon("oberon", "Oberon", "uranus", 761.4, 583_520, 13.463, "#9d978e", {
    eccentricity: 0.0014,
    inclinationDeg: 0.058,
    meanAnomalyAtEpochDeg: 139,
  }),
  moon("ariel", "Ariel", "uranus", 578.9, 190_900, 2.52, "#cac6bc", {
    eccentricity: 0.0012,
    inclinationDeg: 0.31,
    meanAnomalyAtEpochDeg: 217,
  }),
  moon("umbriel", "Umbriel", "uranus", 584.7, 266_000, 4.144, "#8a867f", {
    eccentricity: 0.0039,
    inclinationDeg: 0.36,
    meanAnomalyAtEpochDeg: 74,
  }),
  moon("miranda", "Miranda", "uranus", 235.8, 129_900, 1.413, "#bdb8ad", {
    eccentricity: 0.0013,
    inclinationDeg: 4.338,
    meanAnomalyAtEpochDeg: 287,
  }),
  // Triton's 156.865° inclination already encodes retrograde motion in the standard
  // frame, so it must NOT also set `retrograde: true` — the two encodings cancel and
  // make Triton orbit Neptune prograde (the wrong way). Inclination alone is correct.
  moon("triton", "Triton", "neptune", 1_353.4, 354_759, 5.877, "#c6d3d7", {
    eccentricity: 0.000016,
    inclinationDeg: 156.865,
    meanAnomalyAtEpochDeg: 53,
  }),
];
