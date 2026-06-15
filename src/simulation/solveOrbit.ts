import { AU_KM, DAY_MS, DAY_SECONDS } from "../data/constants";
import type { CelestialBody, Orbit, Vec3 } from "./orbitalElements";
import { addVec3, vectorLength } from "./vec3";

// Re-exported so existing importers keep their `./solveOrbit` source; the canonical
// definitions now live in ./vec3.
export { addVec3, vectorLength };

const TWO_PI = Math.PI * 2;
const JULIAN_DAYS_PER_CENTURY = 36_525;
// The propagator below only handles bound, elliptic orbits. Clamp just shy of 1 so
// parabolic/hyperbolic elements (or eccentricity that drifts past 1 via secular
// rates) degrade to a closed orbit instead of emitting NaN into the scene.
const MAX_ELLIPTIC_ECCENTRICITY = 0.999;

type ResolvedOrbitElements = {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanAnomalyDeg: number;
  orbitalPeriodDays: number;
};

export const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

const normalizeRadians = (radians: number) => {
  const normalized = radians % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
};

const normalizeDegrees = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

// J2000 is the only epoch in the dataset, but getElapsedDays is the innermost hot
// path — it runs for every body each frame and thousands of times inside the rocket
// Lambert/bisection loops. Date.parse of the same constant ISO string per call is
// pure waste, so memoize the parse per epoch string.
//
// NOTE: epoch is parsed as UTC. JPL Table-1 elements are defined in Terrestrial Time
// (J2000.0 = 2000-01-01 11:58:55.816 UTC, TT−UTC = 64.184s) and centuries here ignore
// leap seconds. The resulting along-track error is at most a few thousand km (well
// inside JPL's own ~25,000 km accuracy budget for 1800–2050), so this is a deliberate
// simplification, not a correctness target.
const epochMsCache = new Map<string, number>();
const epochToMs = (epoch: string) => {
  let ms = epochMsCache.get(epoch);
  if (ms === undefined) {
    ms = Date.parse(epoch);
    epochMsCache.set(epoch, ms);
  }
  return ms;
};

const getElapsedDays = (orbit: Orbit, date: Date) => (date.getTime() - epochToMs(orbit.epoch)) / DAY_MS;

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

export const getOrbitElementsAtDate = (orbit: Orbit, date: Date): ResolvedOrbitElements => {
  const elapsedDays = getElapsedDays(orbit, date);
  const direction = orbit.retrograde ? -1 : 1;
  const rates = orbit.elementRatesPerCentury;

  if (!rates) {
    return {
      semiMajorAxisKm: orbit.semiMajorAxisKm,
      eccentricity: orbit.eccentricity,
      inclinationDeg: orbit.inclinationDeg,
      longitudeOfAscendingNodeDeg: orbit.longitudeOfAscendingNodeDeg,
      argumentOfPeriapsisDeg: orbit.argumentOfPeriapsisDeg,
      meanAnomalyDeg: normalizeDegrees(
        orbit.meanAnomalyAtEpochDeg + direction * 360 * (elapsedDays / orbit.orbitalPeriodDays),
      ),
      orbitalPeriodDays: orbit.orbitalPeriodDays,
    };
  }

  const centuries = elapsedDays / JULIAN_DAYS_PER_CENTURY;
  const longitudeOfPeriapsisAtEpochDeg = orbit.longitudeOfAscendingNodeDeg + orbit.argumentOfPeriapsisDeg;
  const meanLongitudeAtEpochDeg = longitudeOfPeriapsisAtEpochDeg + orbit.meanAnomalyAtEpochDeg;
  const longitudeOfAscendingNodeDeg =
    orbit.longitudeOfAscendingNodeDeg + (rates.longitudeOfAscendingNodeDeg ?? 0) * centuries;
  const longitudeOfPeriapsisDeg =
    longitudeOfPeriapsisAtEpochDeg + (rates.longitudeOfPeriapsisDeg ?? 0) * centuries;
  const usesMeanLongitudeRate = rates.meanLongitudeDeg !== undefined;
  const meanLongitudeDeg = usesMeanLongitudeRate
    ? meanLongitudeAtEpochDeg + direction * rates.meanLongitudeDeg! * centuries
    : undefined;
  const meanAnomalyRateDegPerCentury =
    rates.meanLongitudeDeg === undefined
      ? undefined
      : rates.meanLongitudeDeg - (rates.longitudeOfPeriapsisDeg ?? 0);

  return {
    semiMajorAxisKm: orbit.semiMajorAxisKm + (rates.semiMajorAxisAu ?? 0) * AU_KM * centuries,
    eccentricity: orbit.eccentricity + (rates.eccentricity ?? 0) * centuries,
    inclinationDeg: orbit.inclinationDeg + (rates.inclinationDeg ?? 0) * centuries,
    longitudeOfAscendingNodeDeg: normalizeDegrees(longitudeOfAscendingNodeDeg),
    argumentOfPeriapsisDeg: normalizeDegrees(longitudeOfPeriapsisDeg - longitudeOfAscendingNodeDeg),
    meanAnomalyDeg:
      meanLongitudeDeg === undefined
        ? normalizeDegrees(orbit.meanAnomalyAtEpochDeg + direction * 360 * (elapsedDays / orbit.orbitalPeriodDays))
        : normalizeDegrees(meanLongitudeDeg - longitudeOfPeriapsisDeg),
    orbitalPeriodDays:
      meanAnomalyRateDegPerCentury && meanAnomalyRateDegPerCentury !== 0
        ? (JULIAN_DAYS_PER_CENTURY * 360) / Math.abs(meanAnomalyRateDegPerCentury)
        : orbit.orbitalPeriodDays,
  };
};

const getPositionFromElementsKm = (elements: ResolvedOrbitElements): Vec3 => {
  const meanAnomalyRad = degToRad(elements.meanAnomalyDeg);
  // sqrt(1 - e^2) and the (1 - e cos E) Newton step below go imaginary/degenerate
  // for e >= 1; clamp so bad data never poisons Three.js transforms with NaN.
  const eccentricity = Math.min(Math.max(elements.eccentricity, 0), MAX_ELLIPTIC_ECCENTRICITY);
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomalyRad, eccentricity);

  const trueAnomaly = Math.atan2(
    Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly),
    Math.cos(eccentricAnomaly) - eccentricity,
  );

  const radiusKm = elements.semiMajorAxisKm * (1 - eccentricity * Math.cos(eccentricAnomaly));
  const argument = degToRad(elements.argumentOfPeriapsisDeg) + trueAnomaly;
  const inclination = degToRad(elements.inclinationDeg);
  const ascendingNode = degToRad(elements.longitudeOfAscendingNodeDeg);

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

export const getOrbitPositionKm = (orbit: Orbit, date: Date): Vec3 =>
  getPositionFromElementsKm(getOrbitElementsAtDate(orbit, date));

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

  const orbit = getOrbitElementsAtDate(body.orbit, date);
  const periodSeconds = Math.abs(orbit.orbitalPeriodDays) * DAY_SECONDS;
  const semiMajorAxisKm = orbit.semiMajorAxisKm;
  const currentRadiusKm = getOrbitRadiusKm(body, date);
  const derivedMu = (4 * Math.PI * Math.PI * semiMajorAxisKm ** 3) / periodSeconds ** 2;

  return Math.sqrt(derivedMu * (2 / currentRadiusKm - 1 / semiMajorAxisKm));
};

export const sampleOrbitKm = (orbit: Orbit, samples = 192, date = new Date(orbit.epoch)) => {
  const points: Vec3[] = [];
  const step = 360 / samples;
  const elements = getOrbitElementsAtDate(orbit, date);

  for (let index = 0; index <= samples; index += 1) {
    points.push(getPositionFromElementsKm({ ...elements, meanAnomalyDeg: index * step }));
  }

  return points;
};
