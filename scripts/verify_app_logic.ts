import assert from "node:assert/strict";
import { bodiesById } from "../src/data";
import { AU_KM, DAY_SECONDS } from "../src/data/constants";
import type { Vec3 } from "../src/simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../src/simulation/solveOrbit";
import { destinationsById, rocketDestinations } from "../src/features/rockets/destinationCatalog";
import { rocketsById } from "../src/features/rockets/rocketCatalog";
import { computeRocketView } from "../src/features/rockets/rocketState";
import { estimateTransfer, sampleTransferArcKm } from "../src/features/rockets/transferModel";
import { clampCommandActiveIndex } from "../src/ui/commandIndex";
import { readBooleanPreference, writeBooleanPreference } from "../src/ui/safeStorage";

const J2000_MS = Date.parse("2000-01-01T12:00:00.000Z");
const CHECK_DATE = new Date("2026-06-14T00:00:00.000Z");
const TWO_PI = Math.PI * 2;

type JplElements = {
  a: number;
  adot: number;
  e: number;
  edot: number;
  i: number;
  idot: number;
  meanLong: number;
  meanLongDot: number;
  peri: number;
  periDot: number;
  node: number;
  nodeDot: number;
};

const jplApprox: Record<string, JplElements> = {
  mercury: {
    a: 0.38709927,
    adot: 0.00000037,
    e: 0.20563593,
    edot: 0.00001906,
    i: 7.00497902,
    idot: -0.00594749,
    meanLong: 252.2503235,
    meanLongDot: 149472.67411175,
    peri: 77.45779628,
    periDot: 0.16047689,
    node: 48.33076593,
    nodeDot: -0.12534081,
  },
  venus: {
    a: 0.72333566,
    adot: 0.0000039,
    e: 0.00677672,
    edot: -0.00004107,
    i: 3.39467605,
    idot: -0.0007889,
    meanLong: 181.9790995,
    meanLongDot: 58517.81538729,
    peri: 131.60246718,
    periDot: 0.00268329,
    node: 76.67984255,
    nodeDot: -0.27769418,
  },
  earth: {
    a: 1.00000261,
    adot: 0.00000562,
    e: 0.01671123,
    edot: -0.00004392,
    i: -0.00001531,
    idot: -0.01294668,
    meanLong: 100.46457166,
    meanLongDot: 35999.37244981,
    peri: 102.93768193,
    periDot: 0.32327364,
    node: 0,
    nodeDot: 0,
  },
  mars: {
    a: 1.52371034,
    adot: 0.00001847,
    e: 0.0933941,
    edot: 0.00007882,
    i: 1.84969142,
    idot: -0.00813131,
    meanLong: -4.55343205,
    meanLongDot: 19140.30268499,
    peri: -23.94362959,
    periDot: 0.44441088,
    node: 49.55953891,
    nodeDot: -0.29257343,
  },
  jupiter: {
    a: 5.202887,
    adot: -0.00011607,
    e: 0.04838624,
    edot: -0.00013253,
    i: 1.30439695,
    idot: -0.00183714,
    meanLong: 34.39644051,
    meanLongDot: 3034.74612775,
    peri: 14.72847983,
    periDot: 0.21252668,
    node: 100.47390909,
    nodeDot: 0.20469106,
  },
  saturn: {
    a: 9.53667594,
    adot: -0.0012506,
    e: 0.05386179,
    edot: -0.00050991,
    i: 2.48599187,
    idot: 0.00193609,
    meanLong: 49.95424423,
    meanLongDot: 1222.49362201,
    peri: 92.59887831,
    periDot: -0.41897216,
    node: 113.66242448,
    nodeDot: -0.28867794,
  },
  uranus: {
    a: 19.18916464,
    adot: -0.00196176,
    e: 0.04725744,
    edot: -0.00004397,
    i: 0.77263783,
    idot: -0.00242939,
    meanLong: 313.23810451,
    meanLongDot: 428.48202785,
    peri: 170.9542763,
    periDot: 0.40805281,
    node: 74.01692503,
    nodeDot: 0.04240589,
  },
  neptune: {
    a: 30.06992276,
    adot: 0.00026291,
    e: 0.00859048,
    edot: 0.00005105,
    i: 1.77004347,
    idot: 0.00035372,
    meanLong: -55.12002969,
    meanLongDot: 218.45945325,
    peri: 44.96476227,
    periDot: -0.32241464,
    node: 131.78422574,
    nodeDot: -0.00508664,
  },
};

const maxDeltaMillionKm: Record<string, number> = {
  mercury: 0.001,
  venus: 0.001,
  earth: 0.001,
  mars: 0.001,
  jupiter: 0.001,
  saturn: 0.001,
  uranus: 0.001,
  neptune: 0.001,
};

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const norm360 = (degrees: number) => ((degrees % 360) + 360) % 360;
const assertClose = (actual: number | undefined, expected: number, tolerance: number, label: string) => {
  assert.notEqual(actual, undefined, `${label} is missing`);
  assert(Math.abs(actual! - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};

const solveEccentricAnomaly = (meanAnomalyRad: number, eccentricity: number) => {
  const meanAnomaly = ((meanAnomalyRad % TWO_PI) + TWO_PI) % TWO_PI;
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;

  for (let index = 0; index < 12; index += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-10) {
      break;
    }
  }

  return eccentricAnomaly;
};

const positionFromElementsAu = (
  semiMajorAxisAu: number,
  eccentricity: number,
  inclinationDeg: number,
  nodeDeg: number,
  argumentDeg: number,
  meanAnomalyDeg: number,
): Vec3 => {
  const eccentricAnomaly = solveEccentricAnomaly(degToRad(meanAnomalyDeg), eccentricity);
  const trueAnomaly = Math.atan2(
    Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly),
    Math.cos(eccentricAnomaly) - eccentricity,
  );
  const radiusAu = semiMajorAxisAu * (1 - eccentricity * Math.cos(eccentricAnomaly));
  const argument = degToRad(argumentDeg) + trueAnomaly;
  const inclination = degToRad(inclinationDeg);
  const node = degToRad(nodeDeg);

  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosArg = Math.cos(argument);
  const sinArg = Math.sin(argument);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  return [
    radiusAu * (cosNode * cosArg - sinNode * sinArg * cosInc),
    radiusAu * (sinArg * sinInc),
    radiusAu * (sinNode * cosArg + cosNode * sinArg * cosInc),
  ];
};

const jplPositionKm = (bodyId: keyof typeof jplApprox, date: Date): Vec3 => {
  const source = jplApprox[bodyId];
  const centuries = (date.getTime() - J2000_MS) / (DAY_SECONDS * 1_000 * 36_525);
  const semiMajorAxisAu = source.a + source.adot * centuries;
  const eccentricity = source.e + source.edot * centuries;
  const inclinationDeg = source.i + source.idot * centuries;
  const meanLongDeg = source.meanLong + source.meanLongDot * centuries;
  const periDeg = source.peri + source.periDot * centuries;
  const nodeDeg = source.node + source.nodeDot * centuries;
  const argumentDeg = norm360(periDeg - nodeDeg);
  const meanAnomalyDeg = norm360(meanLongDeg - periDeg);
  const positionAu = positionFromElementsAu(
    semiMajorAxisAu,
    eccentricity,
    inclinationDeg,
    norm360(nodeDeg),
    argumentDeg,
    meanAnomalyDeg,
  );

  return [positionAu[0] * AU_KM, positionAu[1] * AU_KM, positionAu[2] * AU_KM];
};

const distanceKm = (a: Vec3, b: Vec3) => vectorLength([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);

const assertRocketDestinationCatalog = () => {
  const nonEarthMoonDestinations = rocketDestinations.filter((destination) => {
    if (!destination.bodyId) {
      return false;
    }
    const body = bodiesById.get(destination.bodyId);
    return body?.type === "moon" && body.parentId !== "earth";
  });

  assert.equal(destinationsById.get("moon")?.bodyId, "moon");
  assert.equal(estimateTransfer(bodiesById.get("titan")!, bodiesById, CHECK_DATE.getTime()), null);
  assert.deepEqual(
    nonEarthMoonDestinations.map((destination) => destination.id),
    [],
    "rocket destinations should exclude non-Earth moons until local capture is modeled",
  );
};

const assertPreLaunchRocketDistance = () => {
  const profile = rocketsById.get("saturn-v");
  const freeDestination = destinationsById.get("free") ?? null;
  const marsDestination = destinationsById.get("mars") ?? null;
  const launchDateMs = Date.parse("2026-06-14T00:00:00.000Z");
  const beforeLaunchMs = Date.parse("2026-05-14T00:00:00.000Z");

  assert(profile);
  assert(marsDestination);

  const freeView = computeRocketView(profile, launchDateMs, beforeLaunchMs, "compressed", freeDestination);
  const directView = computeRocketView(profile, launchDateMs, beforeLaunchMs, "compressed", marsDestination, "direct");
  const transferView = computeRocketView(
    profile,
    launchDateMs,
    beforeLaunchMs,
    "compressed",
    marsDestination,
    "transfer",
  );

  for (const view of [freeView, directView, transferView]) {
    assert.equal(view.status, "pre-launch");
    assert.equal(view.elapsedSeconds, 0);
    assert.equal(view.distanceFromEarthKm, 0);
  }
};

const assertDirectRocketArrivalCapsTelemetry = () => {
  const fusion = rocketsById.get("fusion-drive");
  const neptune = destinationsById.get("neptune");
  const launchDateMs = Date.parse("2026-06-14T12:00:00.000Z");
  const dayMs = DAY_SECONDS * 1_000;

  assert(fusion);
  assert(neptune);

  const arrivalView = computeRocketView(fusion, launchDateMs, launchDateMs + 30 * dayMs, "compressed", neptune, "direct");
  const laterView = computeRocketView(fusion, launchDateMs, launchDateMs + 400 * dayMs, "compressed", neptune, "direct");

  assert.equal(laterView.status, "arrived");
  assert.equal(laterView.speedKmS, 0);
  assert(
    laterView.distanceTraveledKm <= arrivalView.distanceTraveledKm + 1_000_000,
    `direct arrival distance grew from ${(arrivalView.distanceTraveledKm / AU_KM).toFixed(1)} AU to ${(
      laterView.distanceTraveledKm / AU_KM
    ).toFixed(1)} AU`,
  );
};

const assertPlanetOrbitsUseAppCode = () => {
  for (const bodyId of Object.keys(jplApprox) as Array<keyof typeof jplApprox>) {
    const body = bodiesById.get(bodyId);
    assert(body, `missing body ${bodyId}`);
    const appPosition = getBodyPositionKm(body, bodiesById, CHECK_DATE);
    const referencePosition = jplPositionKm(bodyId, CHECK_DATE);
    const deltaMillionKm = distanceKm(appPosition, referencePosition) / 1_000_000;
    assert(
      deltaMillionKm < maxDeltaMillionKm[bodyId],
      `${bodyId} app orbit drifted ${deltaMillionKm.toFixed(3)} million km from JPL approximate elements`,
    );
  }
};

const assertPlanetOrbitRatesMatchJpl = () => {
  for (const bodyId of Object.keys(jplApprox) as Array<keyof typeof jplApprox>) {
    const body = bodiesById.get(bodyId);
    const source = jplApprox[bodyId];
    const rates = body?.orbit?.elementRatesPerCentury;

    assert(rates, `${bodyId} should include JPL per-century element rates`);
    assertClose(rates.semiMajorAxisAu, source.adot, 1e-12, `${bodyId} semi-major-axis rate`);
    assertClose(rates.eccentricity, source.edot, 1e-12, `${bodyId} eccentricity rate`);
    assertClose(rates.inclinationDeg, source.idot, 1e-12, `${bodyId} inclination rate`);
    assertClose(rates.longitudeOfAscendingNodeDeg, source.nodeDot, 1e-12, `${bodyId} node rate`);
    assertClose(rates.longitudeOfPeriapsisDeg, source.periDot, 1e-12, `${bodyId} longitude-of-periapsis rate`);
    assertClose(rates.meanLongitudeDeg, source.meanLongDot, 1e-9, `${bodyId} mean-longitude rate`);
  }
};

const assertTransferEstimateUsesAppCode = () => {
  const mars = bodiesById.get("mars");
  const jupiter = bodiesById.get("jupiter");
  assert(mars);
  assert(jupiter);

  const launchDateMs = CHECK_DATE.getTime();
  const marsTransfer = estimateTransfer(mars, bodiesById, launchDateMs);
  const jupiterTransfer = estimateTransfer(jupiter, bodiesById, launchDateMs);
  const saturnV = rocketsById.get("saturn-v");
  const fusion = rocketsById.get("fusion-drive");
  assert(marsTransfer);
  assert(jupiterTransfer);
  assert(saturnV);
  assert(fusion);

  const marsTransferDays = marsTransfer.transferTimeSeconds / DAY_SECONDS;
  assert(marsTransferDays > 250 && marsTransferDays < 270, `unexpected Mars transfer days ${marsTransferDays}`);
  assert(jupiterTransfer.transferTimeSeconds > marsTransfer.transferTimeSeconds);
  assert(marsTransfer.departureDeltaVKmS > 2.8 && marsTransfer.departureDeltaVKmS < 3.1);
  assert(marsTransfer.arrivalDeltaVKmS !== null);
  assert(marsTransfer.arrivalDeltaVKmS > 2.5 && marsTransfer.arrivalDeltaVKmS < 2.8);

  const saturnMarsTransfer = estimateTransfer(mars, bodiesById, launchDateMs, saturnV);
  const saturnJupiterTransfer = estimateTransfer(jupiter, bodiesById, launchDateMs, saturnV);
  const fusionMarsTransfer = estimateTransfer(mars, bodiesById, launchDateMs, fusion);
  assert(saturnMarsTransfer);
  assert(saturnJupiterTransfer);
  assert(fusionMarsTransfer);
  assert.equal(
    saturnMarsTransfer.transferTimeSeconds,
    marsTransfer.transferTimeSeconds,
    "short-burn chemical profiles should use the orbital transfer baseline",
  );
  assert.equal(
    saturnJupiterTransfer.transferTimeSeconds,
    jupiterTransfer.transferTimeSeconds,
    "Saturn V Jupiter transfers should not get continuous-cruise speed added",
  );
  assert(
    fusionMarsTransfer.transferTimeSeconds < saturnMarsTransfer.transferTimeSeconds,
    "sustained propulsion profiles should produce shorter transfer times",
  );
  assert.notEqual(
    fusionMarsTransfer.arrivalDateMs,
    saturnMarsTransfer.arrivalDateMs,
    "profile-adjusted transfer intercept dates should vary by rocket profile",
  );
};

const assertPoorTransferWindowMissesTarget = () => {
  const mars = bodiesById.get("mars");
  const saturnV = rocketsById.get("saturn-v");
  const marsDestination = destinationsById.get("mars");
  assert(mars);
  assert(saturnV);
  assert(marsDestination);

  const launchDateMs = CHECK_DATE.getTime();
  const estimate = estimateTransfer(mars, bodiesById, launchDateMs, saturnV);
  assert(estimate);
  assert.equal(estimate.launchWindowQuality, "poor");

  const arc = sampleTransferArcKm(estimate, bodiesById, launchDateMs);
  assert(arc);
  const targetArrivalKm = getBodyPositionKm(mars, bodiesById, new Date(estimate.arrivalDateMs));
  const endpointMissKm = distanceKm(arc.interceptPointKm, targetArrivalKm);
  assert(
    endpointMissKm > 0.5 * AU_KM,
    `poor-window Mars transfer endpoint should miss target, got ${(endpointMissKm / AU_KM).toFixed(2)} AU`,
  );

  const launchView = computeRocketView(saturnV, launchDateMs, launchDateMs, "compressed", marsDestination, "transfer");
  assert(launchView.destination);
  assert(
    launchView.destination.closestApproachKm > 0.5 * AU_KM,
    `poor-window closest approach should stay nonzero, got ${(
      launchView.destination.closestApproachKm / AU_KM
    ).toFixed(2)} AU`,
  );

  const postArrivalView = computeRocketView(
    saturnV,
    launchDateMs,
    estimate.arrivalDateMs + 1_000,
    "compressed",
    marsDestination,
    "transfer",
  );
  assert.equal(postArrivalView.status, "flyby");
  assert(postArrivalView.destination);
  assert(
    postArrivalView.destination.distanceToTargetKm > 0.5 * AU_KM,
    `poor-window flyby should remain separated from target, got ${(
      postArrivalView.destination.distanceToTargetKm / AU_KM
    ).toFixed(2)} AU`,
  );
};

const assertCommandPaletteIndexClamping = () => {
  assert.equal(clampCommandActiveIndex(0, 0), 0);
  assert.equal(clampCommandActiveIndex(8, 3), 2);
  assert.equal(clampCommandActiveIndex(-2, 3), 0);
};

const assertSafeBooleanPreferences = () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const setWindow = (value: unknown) =>
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value,
    });

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    assert.equal(readBooleanPreference("missing-window"), false);
    assert.doesNotThrow(() => writeBooleanPreference("missing-window", true));

    setWindow({
      localStorage: {
        getItem: () => "true",
        setItem: () => undefined,
      },
    });
    assert.equal(readBooleanPreference("stored-flag"), true);

    setWindow({
      localStorage: {
        getItem: () => {
          throw new Error("storage denied");
        },
        setItem: () => {
          throw new Error("storage denied");
        },
      },
    });
    assert.equal(readBooleanPreference("blocked-storage"), false);
    assert.doesNotThrow(() => writeBooleanPreference("blocked-storage", true));
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
};

assertRocketDestinationCatalog();
assertPreLaunchRocketDistance();
assertDirectRocketArrivalCapsTelemetry();
assertPlanetOrbitRatesMatchJpl();
assertPlanetOrbitsUseAppCode();
assertTransferEstimateUsesAppCode();
assertPoorTransferWindowMissesTarget();
assertCommandPaletteIndexClamping();
assertSafeBooleanPreferences();

console.log("App logic checks passed");
