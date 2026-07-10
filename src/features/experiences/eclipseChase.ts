import { bodiesById } from "../../data";
import { DAY_MS } from "../../data/constants";
import type { Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";

export type SolarEclipseKind = "partial" | "annular" | "total";
export type SolarEclipseGeometryKind = SolarEclipseKind | "none";

export type SolarEclipseGeometry = {
  dateMs: number;
  kind: SolarEclipseGeometryKind;
  solarAngularSeparationDeg: number;
  sunAngularRadiusDeg: number;
  moonAngularRadiusDeg: number;
  sunMoonDistanceKm: number;
  moonEarthDistanceKm: number;
  axisDistanceMoonToEarthKm: number;
  shadowAxisMissKm: number;
  penumbraRadiusAtEarthKm: number;
  coreRadiusAtEarthKm: number;
  penumbraMarginKm: number;
  coreIntersectionMarginKm: number;
};

export type ModeledSolarEclipse = SolarEclipseGeometry & {
  kind: SolarEclipseKind;
  maximumDateMs: number;
  predictionBasis: string;
  modelValidityToMs: number;
  isExtrapolated: boolean;
  narration: string;
};

const sun = bodiesById.get("sun");
const earth = bodiesById.get("earth");
const moon = bodiesById.get("moon");

if (!sun || !earth || !moon) {
  throw new Error("Eclipse Chase requires Sun, Earth, and Moon data");
}

const SUN_RADIUS_KM = sun.physical.radiusKm;
const EARTH_RADIUS_KM = earth.physical.radiusKm;
const MOON_RADIUS_KM = moon.physical.radiusKm;
const COARSE_STEP_MS = 6 * 60 * 60 * 1_000;
const MINIMUM_SEARCH_LEAD_MS = 60 * 1_000;
const DEFAULT_SEARCH_DAYS = 550;
const TERNARY_REFINEMENT_STEPS = 44;
const RAD_TO_DEG = 180 / Math.PI;

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const multiply = (value: Vec3, scalar: number): Vec3 => [
  value[0] * scalar,
  value[1] * scalar,
  value[2] * scalar,
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (value: Vec3): Vec3 => {
  const length = vectorLength(value);
  return length === 0 ? [0, 0, 0] : multiply(value, 1 / length);
};

const angularSeparationDeg = (a: Vec3, b: Vec3) => {
  const aLength = vectorLength(a);
  const bLength = vectorLength(b);
  if (aLength === 0 || bLength === 0) {
    return 180;
  }
  const cosine = Math.min(1, Math.max(-1, dot(a, b) / (aLength * bLength)));
  return Math.acos(cosine) * RAD_TO_DEG;
};

const apparentRadiusDeg = (radiusKm: number, distanceKm: number) =>
  Math.asin(Math.min(1, radiusKm / Math.max(distanceKm, radiusKm))) * RAD_TO_DEG;

/**
 * Earth-intersection geometry for the Moon's solar shadow cone.
 *
 * This is a finite-disk Sun/Moon calculation, not a longitude-only new-moon
 * shortcut.  A partial event is returned only when the modeled penumbra intersects
 * the physical Earth sphere.  `coreRadiusAtEarthKm` is signed: positive in the
 * umbra (total), negative in the antumbra (annular).
 */
export const getSolarEclipseGeometry = (dateMs: number): SolarEclipseGeometry => {
  const date = new Date(dateMs);
  const sunPosition: Vec3 = [0, 0, 0];
  const earthPosition = getBodyPositionKm(earth, bodiesById, date);
  const moonPosition = getBodyPositionKm(moon, bodiesById, date);
  const sunToMoon = subtract(moonPosition, sunPosition);
  const moonToEarth = subtract(earthPosition, moonPosition);
  const earthToSun = subtract(sunPosition, earthPosition);
  const earthToMoon = subtract(moonPosition, earthPosition);
  const sunMoonDistanceKm = vectorLength(sunToMoon);
  const moonEarthDistanceKm = vectorLength(moonToEarth);
  const shadowAxis = normalize(sunToMoon);
  const axisDistanceMoonToEarthKm = dot(moonToEarth, shadowAxis);
  const axisClosestVector = multiply(shadowAxis, axisDistanceMoonToEarthKm);
  const shadowAxisMissKm = vectorLength(subtract(moonToEarth, axisClosestVector));

  const penumbraRadiusAtEarthKm =
    MOON_RADIUS_KM +
    (axisDistanceMoonToEarthKm * (SUN_RADIUS_KM + MOON_RADIUS_KM)) / Math.max(sunMoonDistanceKm, 1);
  const coreRadiusAtEarthKm =
    MOON_RADIUS_KM -
    (axisDistanceMoonToEarthKm * (SUN_RADIUS_KM - MOON_RADIUS_KM)) / Math.max(sunMoonDistanceKm, 1);
  const penumbraMarginKm = EARTH_RADIUS_KM + penumbraRadiusAtEarthKm - shadowAxisMissKm;
  const coreIntersectionMarginKm =
    EARTH_RADIUS_KM + Math.abs(coreRadiusAtEarthKm) - shadowAxisMissKm;

  let kind: SolarEclipseGeometryKind = "none";
  if (axisDistanceMoonToEarthKm > 0 && penumbraMarginKm >= 0) {
    if (coreIntersectionMarginKm >= 0) {
      kind = coreRadiusAtEarthKm >= 0 ? "total" : "annular";
    } else {
      kind = "partial";
    }
  }

  return {
    dateMs,
    kind,
    solarAngularSeparationDeg: angularSeparationDeg(earthToSun, earthToMoon),
    sunAngularRadiusDeg: apparentRadiusDeg(SUN_RADIUS_KM, vectorLength(earthToSun)),
    moonAngularRadiusDeg: apparentRadiusDeg(MOON_RADIUS_KM, moonEarthDistanceKm),
    sunMoonDistanceKm,
    moonEarthDistanceKm,
    axisDistanceMoonToEarthKm,
    shadowAxisMissKm,
    penumbraRadiusAtEarthKm,
    coreRadiusAtEarthKm,
    penumbraMarginKm,
    coreIntersectionMarginKm,
  };
};

const refineSyzygyMinimum = (fromMs: number, toMs: number) => {
  let low = fromMs;
  let high = toMs;

  for (let index = 0; index < TERNARY_REFINEMENT_STEPS; index += 1) {
    const span = high - low;
    const left = low + span / 3;
    const right = high - span / 3;
    const leftSeparation = getSolarEclipseGeometry(left).solarAngularSeparationDeg;
    const rightSeparation = getSolarEclipseGeometry(right).solarAngularSeparationDeg;
    if (leftSeparation <= rightSeparation) {
      high = right;
    } else {
      low = left;
    }
  }

  return (low + high) / 2;
};

const eclipseNarration = (kind: SolarEclipseKind) => {
  if (kind === "total") {
    return "Watch the Moon cross the Sun–Earth line. Its modeled umbra reaches Earth near maximum alignment.";
  }
  if (kind === "annular") {
    return "Watch the Moon cross the Sun–Earth line. The modeled umbra ends short of Earth, leaving an antumbral ring.";
  }
  return "Watch the Moon skim the Sun–Earth line. Only the modeled penumbra clips Earth in this encounter.";
};

const eclipseModelValidityToMs = Math.min(
  Date.parse(earth.orbit?.metadata?.validity.to ?? "2050-12-31T23:59:59Z"),
  Date.parse(moon.orbit?.metadata?.validity.to ?? "2050-12-31T23:59:59Z"),
);

/**
 * Find the next modeled solar eclipse maximum after `startMs`.
 *
 * Six-hour samples locate each new-moon minimum; a deterministic ternary solve
 * then refines the Sun/Moon angular separation. The resulting event must also pass
 * the physical shadow-cone/Earth-sphere intersection above. No canned eclipse dates
 * are used.
 */
export const findNextModeledSolarEclipse = (
  startMs: number,
  searchDays = DEFAULT_SEARCH_DAYS,
): ModeledSolarEclipse | null => {
  if (!Number.isFinite(startMs) || !Number.isFinite(searchDays) || searchDays <= 0) {
    return null;
  }

  const firstMs = startMs + MINIMUM_SEARCH_LEAD_MS;
  const endMs = firstMs + searchDays * DAY_MS;
  let before = getSolarEclipseGeometry(firstMs);
  let middle = getSolarEclipseGeometry(firstMs + COARSE_STEP_MS);

  for (let currentMs = firstMs + COARSE_STEP_MS * 2; currentMs <= endMs; currentMs += COARSE_STEP_MS) {
    const after = getSolarEclipseGeometry(currentMs);
    if (
      middle.solarAngularSeparationDeg <= before.solarAngularSeparationDeg &&
      middle.solarAngularSeparationDeg < after.solarAngularSeparationDeg
    ) {
      const maximumDateMs = refineSyzygyMinimum(before.dateMs, after.dateMs);
      if (maximumDateMs > startMs) {
        const geometry = getSolarEclipseGeometry(maximumDateMs);
        if (geometry.kind !== "none") {
          return {
            ...geometry,
            kind: geometry.kind,
            maximumDateMs,
            predictionBasis:
              "JPL approximate Earth elements plus JPL lunar mean elements, solved as a finite solar shadow cone",
            modelValidityToMs: eclipseModelValidityToMs,
            isExtrapolated: maximumDateMs > eclipseModelValidityToMs,
            narration: eclipseNarration(geometry.kind),
          };
        }
      }
    }
    before = middle;
    middle = after;
  }

  return null;
};
