import { J2000_EPOCH } from "./constants";
import { BODY_ORIENTATIONS } from "./orientations";
import {
  BODY_PHYSICAL_METADATA,
  ECLIPTIC_J2000_FRAME,
  createSatelliteMeanElementMetadata,
  type SatelliteEphemerisId,
} from "./scientificMetadata";
import type { CelestialBody, OrbitReferenceFrame } from "../simulation/orbitalElements";

const moonOrbitColor = "#aeb8b5";

const laplacePlane = (
  parentId: string,
  poleRightAscensionDeg: number,
  poleDeclinationDeg: number,
): OrbitReferenceFrame => ({
  id: "laplace-plane",
  label: `${parentId} satellite local Laplace plane`,
  poleRightAscensionDeg,
  poleDeclinationDeg,
  poleEpoch: J2000_EPOCH,
  poleTimeScale: "TDB",
  centerId: parentId,
});

const URANUS_EQUATOR: OrbitReferenceFrame = {
  id: "body-equator",
  label: "Uranus equator (IAU pole at J2000)",
  poleRightAscensionDeg: 257.311,
  poleDeclinationDeg: -15.175,
  poleEpoch: J2000_EPOCH,
  poleTimeScale: "TDB",
  centerId: "uranus",
};

type MoonElements = {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanAnomalyAtEpochDeg: number;
  orbitalPeriodDays: number;
  referenceFrame: OrbitReferenceFrame;
  ephemeris: SatelliteEphemerisId;
  apsidalPrecessionYears: number;
  nodalPrecessionYears: number;
  nodalPrecessionDirection?: 1 | -1;
};

const getSatelliteElementRates = (elements: MoonElements) => {
  const longitudeOfAscendingNodeDeg = elements.nodalPrecessionYears
    ? ((elements.nodalPrecessionDirection ?? -1) * 36_000) / elements.nodalPrecessionYears
    : 0;
  const argumentOfPeriapsisDeg = elements.apsidalPrecessionYears
    ? 36_000 / elements.apsidalPrecessionYears
    : 0;
  const longitudeOfPeriapsisDeg = longitudeOfAscendingNodeDeg + argumentOfPeriapsisDeg;
  const meanAnomalyDeg = (36_525 * 360) / elements.orbitalPeriodDays;
  return {
    longitudeOfAscendingNodeDeg,
    longitudeOfPeriapsisDeg,
    meanLongitudeDeg: meanAnomalyDeg + longitudeOfPeriapsisDeg,
  };
};

const moon = (
  id: string,
  name: string,
  parentId: string,
  radiusKm: number,
  color: string,
  elements: MoonElements,
  texture?: string,
): CelestialBody => ({
  id,
  name,
  type: "moon",
  parentId,
  physical: {
    radiusKm,
    color,
    texture,
    orientation: BODY_ORIENTATIONS[id],
  },
  orbit: {
    semiMajorAxisKm: elements.semiMajorAxisKm,
    eccentricity: elements.eccentricity,
    inclinationDeg: elements.inclinationDeg,
    longitudeOfAscendingNodeDeg: elements.longitudeOfAscendingNodeDeg,
    argumentOfPeriapsisDeg: elements.argumentOfPeriapsisDeg,
    meanAnomalyAtEpochDeg: elements.meanAnomalyAtEpochDeg,
    orbitalPeriodDays: elements.orbitalPeriodDays,
    epoch: J2000_EPOCH,
    epochTimeScale: "TDB",
    referenceFrame: elements.referenceFrame,
    metadata: createSatelliteMeanElementMetadata(elements.ephemeris, elements.referenceFrame.label),
    elementRatesPerCentury: getSatelliteElementRates(elements),
  },
  scientific: BODY_PHYSICAL_METADATA,
  render: {
    showLabelDefault: false,
    orbitColor: moonOrbitColor,
    trailColor: color,
  },
});

// JPL Planetary Satellite Mean Elements.  Unlike the previous visual seeds,
// every angle below is a published J2000 phase and every non-ecliptic element set
// carries the source plane pole needed for an inertial-frame transform.
export const majorMoons: CelestialBody[] = [
  moon("moon", "Moon", "earth", 1_737.4, "#d5d0c7", {
    semiMajorAxisKm: 384_400,
    eccentricity: 0.0554,
    inclinationDeg: 5.16,
    longitudeOfAscendingNodeDeg: 125.08,
    argumentOfPeriapsisDeg: 318.15,
    meanAnomalyAtEpochDeg: 135.847_336_225,
    orbitalPeriodDays: 27.321_890_868,
    referenceFrame: ECLIPTIC_J2000_FRAME,
    ephemeris: "DE405/LE405",
    apsidalPrecessionYears: 5.997,
    nodalPrecessionYears: 18.6,
  }, "textures/moon.jpg"),
  moon("io", "Io", "jupiter", 1_821.6, "#d6bd71", {
    semiMajorAxisKm: 421_800,
    eccentricity: 0.004,
    inclinationDeg: 0,
    longitudeOfAscendingNodeDeg: 0,
    argumentOfPeriapsisDeg: 49.1,
    meanAnomalyAtEpochDeg: 330.797_553_898,
    orbitalPeriodDays: 1.769_104_042,
    referenceFrame: laplacePlane("jupiter", 268.1, 64.5),
    ephemeris: "JUP365",
    apsidalPrecessionYears: 1.333,
    nodalPrecessionYears: 0,
  }),
  moon("europa", "Europa", "jupiter", 1_560.8, "#c8c0aa", {
    semiMajorAxisKm: 671_100,
    eccentricity: 0.009,
    inclinationDeg: 0.5,
    longitudeOfAscendingNodeDeg: 184,
    argumentOfPeriapsisDeg: 45,
    meanAnomalyAtEpochDeg: 345.396_310_687,
    orbitalPeriodDays: 3.551_372_776,
    referenceFrame: laplacePlane("jupiter", 268.1, 64.5),
    ephemeris: "JUP365",
    apsidalPrecessionYears: 1.394,
    nodalPrecessionYears: 30.202,
  }),
  moon("ganymede", "Ganymede", "jupiter", 2_634.1, "#aaa291", {
    semiMajorAxisKm: 1_070_400,
    eccentricity: 0.001,
    inclinationDeg: 0.2,
    longitudeOfAscendingNodeDeg: 58.5,
    argumentOfPeriapsisDeg: 198.3,
    meanAnomalyAtEpochDeg: 324.765_596_391,
    orbitalPeriodDays: 7.155_586_438,
    referenceFrame: laplacePlane("jupiter", 268.2, 64.6),
    ephemeris: "JUP365",
    apsidalPrecessionYears: 68.301,
    nodalPrecessionYears: 137.812,
  }),
  moon("callisto", "Callisto", "jupiter", 2_410.3, "#8d8275", {
    semiMajorAxisKm: 1_882_700,
    eccentricity: 0.007,
    inclinationDeg: 0.3,
    longitudeOfAscendingNodeDeg: 309.1,
    argumentOfPeriapsisDeg: 43.8,
    meanAnomalyAtEpochDeg: 87.523_972_862,
    orbitalPeriodDays: 16.690_445_553,
    referenceFrame: laplacePlane("jupiter", 268.7, 64.8),
    ephemeris: "JUP365",
    apsidalPrecessionYears: 277.921,
    nodalPrecessionYears: 577.264,
  }),
  moon("titan", "Titan", "saturn", 2_574.7, "#d2a765", {
    semiMajorAxisKm: 1_221_900,
    eccentricity: 0.029,
    inclinationDeg: 0.3,
    longitudeOfAscendingNodeDeg: 78.6,
    argumentOfPeriapsisDeg: 78.3,
    meanAnomalyAtEpochDeg: 217.697_822_103,
    orbitalPeriodDays: 15.946_851_096,
    referenceFrame: laplacePlane("saturn", 36.4, 84),
    ephemeris: "SAT441",
    apsidalPrecessionYears: 346.68,
    nodalPrecessionYears: 687.37,
  }),
  moon("enceladus", "Enceladus", "saturn", 252.1, "#e8e8df", {
    semiMajorAxisKm: 238_400,
    eccentricity: 0.005,
    inclinationDeg: 0,
    longitudeOfAscendingNodeDeg: 0,
    argumentOfPeriapsisDeg: 119.5,
    meanAnomalyAtEpochDeg: 62.451_930_167,
    orbitalPeriodDays: 1.370_236_382,
    referenceFrame: laplacePlane("saturn", 40.6, 83.5),
    ephemeris: "SAT441",
    apsidalPrecessionYears: 2.916,
    nodalPrecessionYears: 0,
  }),
  moon("rhea", "Rhea", "saturn", 763.8, "#b9b5aa", {
    semiMajorAxisKm: 527_200,
    eccentricity: 0.001,
    inclinationDeg: 0.3,
    longitudeOfAscendingNodeDeg: 133.7,
    argumentOfPeriapsisDeg: 44.3,
    meanAnomalyAtEpochDeg: 234.210_586_644,
    orbitalPeriodDays: 4.517_587_576,
    referenceFrame: laplacePlane("saturn", 40.6, 83.5),
    ephemeris: "SAT441",
    apsidalPrecessionYears: 33.939,
    nodalPrecessionYears: 35.775,
  }),
  moon("iapetus", "Iapetus", "saturn", 734.5, "#9b9486", {
    semiMajorAxisKm: 3_561_700,
    eccentricity: 0.028,
    inclinationDeg: 7.6,
    longitudeOfAscendingNodeDeg: 86.5,
    argumentOfPeriapsisDeg: 254.5,
    meanAnomalyAtEpochDeg: 219.835_175_862,
    orbitalPeriodDays: 79.336_717_467,
    referenceFrame: laplacePlane("saturn", 288.7, 78.9),
    ephemeris: "SAT441",
    apsidalPrecessionYears: 1_662.9,
    nodalPrecessionYears: 3_130.302,
  }),
  moon("titania", "Titania", "uranus", 788.9, "#b6b2a9", {
    semiMajorAxisKm: 436_298,
    eccentricity: 0.002,
    inclinationDeg: 0.1,
    longitudeOfAscendingNodeDeg: 29.5,
    argumentOfPeriapsisDeg: 184,
    meanAnomalyAtEpochDeg: 44.469_251_787,
    orbitalPeriodDays: 8.708_282_309,
    referenceFrame: URANUS_EQUATOR,
    ephemeris: "URA182",
    apsidalPrecessionYears: 579.928,
    nodalPrecessionYears: 1_644.649,
  }),
  moon("oberon", "Oberon", "uranus", 761.4, "#9d978e", {
    semiMajorAxisKm: 583_511,
    eccentricity: 0.002,
    inclinationDeg: 0.1,
    longitudeOfAscendingNodeDeg: 76.8,
    argumentOfPeriapsisDeg: 132.2,
    meanAnomalyAtEpochDeg: 338.474_072_157,
    orbitalPeriodDays: 13.462_963_591,
    referenceFrame: URANUS_EQUATOR,
    ephemeris: "URA182",
    apsidalPrecessionYears: 158.604,
    nodalPrecessionYears: 192.798,
  }),
  moon("ariel", "Ariel", "uranus", 578.9, "#cac6bc", {
    semiMajorAxisKm: 190_929,
    eccentricity: 0.001,
    inclinationDeg: 0,
    longitudeOfAscendingNodeDeg: 0,
    argumentOfPeriapsisDeg: 9.6,
    meanAnomalyAtEpochDeg: 327.172_767_937,
    orbitalPeriodDays: 2.520_680_208,
    referenceFrame: URANUS_EQUATOR,
    ephemeris: "URA182",
    apsidalPrecessionYears: 28.901,
    nodalPrecessionYears: 0,
  }),
  moon("umbriel", "Umbriel", "uranus", 584.7, "#8a867f", {
    semiMajorAxisKm: 265_986,
    eccentricity: 0.004,
    inclinationDeg: 0.1,
    longitudeOfAscendingNodeDeg: 174.8,
    argumentOfPeriapsisDeg: 183.4,
    meanAnomalyAtEpochDeg: 291.470_319_808,
    orbitalPeriodDays: 4.144_113_73,
    referenceFrame: URANUS_EQUATOR,
    ephemeris: "URA182",
    apsidalPrecessionYears: 64.126,
    nodalPrecessionYears: 129.745,
  }),
  moon("miranda", "Miranda", "uranus", 235.8, "#bdb8ad", {
    semiMajorAxisKm: 129_846,
    eccentricity: 0.001,
    inclinationDeg: 4.4,
    longitudeOfAscendingNodeDeg: 100.9,
    argumentOfPeriapsisDeg: 154.8,
    meanAnomalyAtEpochDeg: 316.689_991_697,
    orbitalPeriodDays: 1.413_556_407,
    referenceFrame: URANUS_EQUATOR,
    ephemeris: "URA182",
    apsidalPrecessionYears: 8.939,
    nodalPrecessionYears: 17.787,
  }),
  moon("triton", "Triton", "neptune", 1_353.4, "#c6d3d7", {
    semiMajorAxisKm: 354_800,
    eccentricity: 0,
    inclinationDeg: 157.3,
    longitudeOfAscendingNodeDeg: 178.1,
    argumentOfPeriapsisDeg: 0,
    meanAnomalyAtEpochDeg: 58.989_196_171,
    orbitalPeriodDays: 5.876_563_9,
    referenceFrame: laplacePlane("neptune", 299.8, 43.1),
    ephemeris: "NEP097",
    apsidalPrecessionYears: 0,
    nodalPrecessionYears: 340.379,
    nodalPrecessionDirection: 1,
  }),
];
