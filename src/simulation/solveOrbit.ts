import { DAY_MS, DAY_SECONDS } from "../data/constants";
import type { CelestialBody, Orbit, Vec3 } from "./orbitalElements";

const TWO_PI = Math.PI * 2;

export const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

const normalizeRadians = (radians: number) => {
  const normalized = radians % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
};

export const vectorLength = ([x, y, z]: Vec3) => Math.sqrt(x * x + y * y + z * z);

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const solveEccentricAnomaly = (meanAnomalyRad: number, eccentricity: number) => {
  const meanAnomaly = normalizeRadians(meanAnomalyRad);
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

export const getOrbitPositionKm = (orbit: Orbit, date: Date): Vec3 => {
  const elapsedDays = (date.getTime() - Date.parse(orbit.epoch)) / DAY_MS;
  const direction = orbit.retrograde ? -1 : 1;
  const meanAnomalyRad =
    degToRad(orbit.meanAnomalyAtEpochDeg) +
    direction * TWO_PI * (elapsedDays / orbit.orbitalPeriodDays);

  const eccentricAnomaly = solveEccentricAnomaly(meanAnomalyRad, orbit.eccentricity);
  const trueAnomaly = Math.atan2(
    Math.sqrt(1 - orbit.eccentricity * orbit.eccentricity) * Math.sin(eccentricAnomaly),
    Math.cos(eccentricAnomaly) - orbit.eccentricity,
  );

  const radiusKm = orbit.semiMajorAxisKm * (1 - orbit.eccentricity * Math.cos(eccentricAnomaly));
  const argument = degToRad(orbit.argumentOfPeriapsisDeg) + trueAnomaly;
  const inclination = degToRad(orbit.inclinationDeg);
  const ascendingNode = degToRad(orbit.longitudeOfAscendingNodeDeg);

  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosArg = Math.cos(argument);
  const sinArg = Math.sin(argument);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  return [
    radiusKm * (cosNode * cosArg - sinNode * sinArg * cosInc),
    radiusKm * (sinArg * sinInc),
    radiusKm * (sinNode * cosArg + cosNode * sinArg * cosInc),
  ];
};

export const getBodyPositionKm = (
  body: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  date: Date,
): Vec3 => {
  if (!body.orbit || !body.parentId) {
    return [0, 0, 0];
  }

  const parent = bodiesById.get(body.parentId);
  const localPosition = getOrbitPositionKm(body.orbit, date);

  if (!parent) {
    return localPosition;
  }

  return addVec3(getBodyPositionKm(parent, bodiesById, date), localPosition);
};

export const getOrbitRadiusKm = (body: CelestialBody, date: Date) => {
  if (!body.orbit) {
    return 0;
  }

  return vectorLength(getOrbitPositionKm(body.orbit, date));
};

export const estimateOrbitalSpeedKmS = (body: CelestialBody, date: Date) => {
  if (!body.orbit) {
    return 0;
  }

  const periodSeconds = Math.abs(body.orbit.orbitalPeriodDays) * DAY_SECONDS;
  const semiMajorAxisKm = body.orbit.semiMajorAxisKm;
  const currentRadiusKm = getOrbitRadiusKm(body, date);
  const derivedMu = (4 * Math.PI * Math.PI * semiMajorAxisKm ** 3) / periodSeconds ** 2;

  return Math.sqrt(derivedMu * (2 / currentRadiusKm - 1 / semiMajorAxisKm));
};

export const sampleOrbitKm = (orbit: Orbit, samples = 192) => {
  const points: Vec3[] = [];
  const step = 360 / samples;

  for (let index = 0; index <= samples; index += 1) {
    points.push(
      getOrbitPositionKm(
        {
          ...orbit,
          epoch: orbit.epoch,
          meanAnomalyAtEpochDeg: index * step,
        },
        new Date(orbit.epoch),
      ),
    );
  }

  return points;
};
