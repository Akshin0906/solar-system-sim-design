import { DAY_SECONDS, EARTH_RADIUS_KM } from "../../data/constants";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import {
  getBodyPositionKm,
  getOrbitElementsAtDate,
  getOrbitPositionKm,
  vectorLength,
} from "../../simulation/solveOrbit";
import {
  addVec3 as add,
  lerpVec3 as lerp,
  mulVec3 as mul,
  normalizeVec3 as normalize,
  subVec3 as sub,
} from "../../simulation/vec3";
import { sampleFlight } from "./flightModel";
import type { RocketProfile } from "./rocketCatalog";

const EARTH_ID = "earth";
const SUN_ID = "sun";
const TWO_PI = Math.PI * 2;
const LEO_ALTITUDE_KM = 400;
const PROFILE_TRANSFER_SEARCH_ITERATIONS = 56;
const PROFILE_TRANSFER_MAX_SECONDS = 31_557_600 * 120;

export type LaunchWindowQuality = "excellent" | "good" | "fair" | "poor";
export type TransferCentralBody = "sun" | "earth";

export type TransferEstimate = {
  centralBodyId: TransferCentralBody;
  originBodyId: string;
  destinationBodyId: string;
  transferTargetBodyId: string;
  transferTimeSeconds: number;
  arrivalDateMs: number;
  originOrbitRadiusKm: number;
  destinationOrbitRadiusKm: number;
  transferSemiMajorAxisKm: number;
  meanTransferSpeedKmS: number;
  idealPhaseAngleDeg: number;
  currentPhaseAngleDeg: number;
  phaseOffsetDeg: number;
  departureDeltaVKmS: number;
  arrivalDeltaVKmS: number | null;
  launchWindowQuality: LaunchWindowQuality;
  favorable: boolean;
  approximate: true;
  targetIsMoon: boolean;
  notes: string[];
};

export type TransferArc = {
  pointsKm: Vec3[];
  arcLengthKm: number;
  launchPointKm: Vec3;
  interceptPointKm: Vec3;
};

export const normalizeSignedRadians = (radians: number) => {
  const normalized = ((((radians + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return normalized === -Math.PI ? Math.PI : normalized;
};

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

const angleFromSun = ([x, _y, z]: Vec3) => Math.atan2(z, x);

const quadraticBezier = (a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 => {
  const ab = lerp(a, b, t);
  const bc = lerp(b, c, t);
  return lerp(ab, bc, t);
};

const cubicBezier = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 => {
  const ab = lerp(a, b, t);
  const bc = lerp(b, c, t);
  const cd = lerp(c, d, t);
  return lerp(lerp(ab, bc, t), lerp(bc, cd, t), t);
};

const measurePolylineKm = (points: Vec3[]) =>
  points.reduce((distance, point, index) => {
    if (index === 0) {
      return distance;
    }
    return distance + vectorLength(sub(point, points[index - 1]));
  }, 0);

const qualityFromPhaseOffset = (phaseOffsetDeg: number): LaunchWindowQuality => {
  const abs = Math.abs(phaseOffsetDeg);
  if (abs <= 5) {
    return "excellent";
  }
  if (abs <= 15) {
    return "good";
  }
  if (abs <= 35) {
    return "fair";
  }
  return "poor";
};

const getCentralMu = (body: CelestialBody) => body.physical.gravitationalParameterKm3S2 ?? 0;

const circularSpeed = (muKm3S2: number, radiusKm: number) => Math.sqrt(muKm3S2 / radiusKm);

const transferSpeed = (muKm3S2: number, radiusKm: number, transferSemiMajorAxisKm: number) =>
  Math.sqrt(muKm3S2 * (2 / radiusKm - 1 / transferSemiMajorAxisKm));

const solveProfileAdjustedTransfer = (
  profile: RocketProfile | null | undefined,
  baselineTransferTimeSeconds: number,
  baselineMeanTransferSpeedKmS: number,
): { transferTimeSeconds: number; meanTransferSpeedKmS: number } => {
  if (!profile) {
    return {
      transferTimeSeconds: baselineTransferTimeSeconds,
      meanTransferSpeedKmS: baselineMeanTransferSpeedKmS,
    };
  }

  const routeDistanceKm = baselineMeanTransferSpeedKmS * baselineTransferTimeSeconds;
  if (!Number.isFinite(routeDistanceKm) || routeDistanceKm <= 0) {
    return {
      transferTimeSeconds: baselineTransferTimeSeconds,
      meanTransferSpeedKmS: baselineMeanTransferSpeedKmS,
    };
  }

  const coveredDistanceAt = (seconds: number) =>
    baselineMeanTransferSpeedKmS * seconds + sampleFlight(profile, seconds).distanceTraveledKm;

  let lowerSeconds = 0;
  let upperSeconds = Math.min(
    Math.max(baselineTransferTimeSeconds, 1),
    PROFILE_TRANSFER_MAX_SECONDS,
  );

  while (
    upperSeconds < PROFILE_TRANSFER_MAX_SECONDS &&
    coveredDistanceAt(upperSeconds) < routeDistanceKm
  ) {
    lowerSeconds = upperSeconds;
    upperSeconds = Math.min(upperSeconds * 2, PROFILE_TRANSFER_MAX_SECONDS);
  }

  if (coveredDistanceAt(upperSeconds) < routeDistanceKm) {
    return {
      transferTimeSeconds: baselineTransferTimeSeconds,
      meanTransferSpeedKmS: baselineMeanTransferSpeedKmS,
    };
  }

  for (let index = 0; index < PROFILE_TRANSFER_SEARCH_ITERATIONS; index += 1) {
    const midSeconds = (lowerSeconds + upperSeconds) / 2;
    if (coveredDistanceAt(midSeconds) >= routeDistanceKm) {
      upperSeconds = midSeconds;
    } else {
      lowerSeconds = midSeconds;
    }
  }

  return {
    transferTimeSeconds: upperSeconds,
    meanTransferSpeedKmS: routeDistanceKm / upperSeconds,
  };
};

const progradeTangentFromSun = ([x, _y, z]: Vec3): Vec3 => {
  const tangent = normalize([-z, 0, x]);
  return vectorLength(tangent) === 0 ? [0, 0, 1] : tangent;
};

const estimateLocalMoonTransfer = (
  earth: CelestialBody,
  destinationBody: CelestialBody,
  launchDateMs: number,
  profile?: RocketProfile | null,
): TransferEstimate | null => {
  if (!destinationBody.orbit) {
    return null;
  }

  const muEarth = getCentralMu(earth);
  if (muEarth <= 0) {
    return null;
  }

  const launchDate = new Date(launchDateMs);
  const destinationOrbit = getOrbitElementsAtDate(destinationBody.orbit, launchDate);
  const originRadiusKm = EARTH_RADIUS_KM + LEO_ALTITUDE_KM;
  const destinationRadiusKm = destinationOrbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const baselineTransferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muEarth);
  if (!Number.isFinite(baselineTransferTimeSeconds) || baselineTransferTimeSeconds <= 0) {
    return null;
  }

  const departureTransferSpeedKmS = transferSpeed(muEarth, originRadiusKm, transferSemiMajorAxisKm);
  const arrivalTransferSpeedKmS = transferSpeed(muEarth, destinationRadiusKm, transferSemiMajorAxisKm);
  const baselineMeanTransferSpeedKmS = (departureTransferSpeedKmS + arrivalTransferSpeedKmS) / 2;
  const { transferTimeSeconds, meanTransferSpeedKmS } = solveProfileAdjustedTransfer(
    profile,
    baselineTransferTimeSeconds,
    baselineMeanTransferSpeedKmS,
  );
  const departureDeltaVKmS = Math.abs(
    departureTransferSpeedKmS - circularSpeed(muEarth, originRadiusKm),
  );
  const arrivalDeltaVKmS = Math.abs(
    circularSpeed(muEarth, destinationRadiusKm) - arrivalTransferSpeedKmS,
  );

  return {
    centralBodyId: "earth",
    originBodyId: EARTH_ID,
    destinationBodyId: destinationBody.id,
    transferTargetBodyId: destinationBody.id,
    transferTimeSeconds,
    arrivalDateMs: launchDateMs + transferTimeSeconds * 1_000,
    originOrbitRadiusKm: originRadiusKm,
    destinationOrbitRadiusKm: destinationRadiusKm,
    transferSemiMajorAxisKm,
    meanTransferSpeedKmS,
    idealPhaseAngleDeg: 42,
    currentPhaseAngleDeg: 42,
    phaseOffsetDeg: 0,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    launchWindowQuality: "good",
    favorable: true,
    approximate: true,
    targetIsMoon: true,
    notes: [
      profile
        ? "Profile-adjusted Moon transfer uses a simplified Earth-centered parking-orbit estimate."
        : "Moon transfer uses a simplified Earth-centered parking-orbit estimate.",
    ],
  };
};

export const estimateTransfer = (
  destinationBody: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  profile?: RocketProfile | null,
): TransferEstimate | null => {
  const earth = bodiesById.get(EARTH_ID);
  const sun = bodiesById.get(SUN_ID);
  if (!earth || !sun || !earth.orbit) {
    return null;
  }

  if (destinationBody.id === EARTH_ID) {
    return null;
  }

  if (destinationBody.type === "moon" && destinationBody.parentId === EARTH_ID) {
    return estimateLocalMoonTransfer(earth, destinationBody, launchDateMs, profile);
  }

  if (destinationBody.type === "moon") {
    return null;
  }

  const transferTarget = destinationBody;
  if (!transferTarget.orbit || transferTarget.parentId !== SUN_ID) {
    return null;
  }

  const muSun = getCentralMu(sun);
  if (muSun <= 0) {
    return null;
  }

  const launchDate = new Date(launchDateMs);
  const earthOrbit = getOrbitElementsAtDate(earth.orbit, launchDate);
  const transferTargetOrbit = getOrbitElementsAtDate(transferTarget.orbit, launchDate);
  const originRadiusKm = earthOrbit.semiMajorAxisKm;
  const destinationRadiusKm = transferTargetOrbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const baselineTransferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muSun);
  if (!Number.isFinite(baselineTransferTimeSeconds) || baselineTransferTimeSeconds <= 0 || transferTargetOrbit.orbitalPeriodDays === 0) {
    return null;
  }

  const departureTransferSpeedKmS = transferSpeed(muSun, originRadiusKm, transferSemiMajorAxisKm);
  const arrivalTransferSpeedKmS = transferSpeed(muSun, destinationRadiusKm, transferSemiMajorAxisKm);
  const baselineMeanTransferSpeedKmS = (departureTransferSpeedKmS + arrivalTransferSpeedKmS) / 2;
  const { transferTimeSeconds, meanTransferSpeedKmS } = solveProfileAdjustedTransfer(
    profile,
    baselineTransferTimeSeconds,
    baselineMeanTransferSpeedKmS,
  );
  const targetMeanMotion = TWO_PI / (Math.abs(transferTargetOrbit.orbitalPeriodDays) * DAY_SECONDS);
  const idealPhaseAngleRad = normalizeSignedRadians(Math.PI - targetMeanMotion * transferTimeSeconds);

  const earthKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const targetKm = getBodyPositionKm(transferTarget, bodiesById, launchDate);
  const currentPhaseAngleRad = normalizeSignedRadians(angleFromSun(targetKm) - angleFromSun(earthKm));
  const phaseOffsetRad = normalizeSignedRadians(currentPhaseAngleRad - idealPhaseAngleRad);
  const phaseOffsetDeg = radiansToDegrees(phaseOffsetRad);
  const launchWindowQuality = qualityFromPhaseOffset(phaseOffsetDeg);
  const departureDeltaVKmS = Math.abs(departureTransferSpeedKmS - circularSpeed(muSun, originRadiusKm));
  const arrivalDeltaVKmS = Math.abs(
    circularSpeed(muSun, destinationRadiusKm) - arrivalTransferSpeedKmS,
  );

  const notes = [
    profile
      ? "Profile-adjusted Hohmann estimate assumes circular, coplanar heliocentric orbits."
      : "Hohmann estimate assumes circular, coplanar heliocentric orbits.",
  ];

  return {
    centralBodyId: "sun",
    originBodyId: EARTH_ID,
    destinationBodyId: destinationBody.id,
    transferTargetBodyId: transferTarget.id,
    transferTimeSeconds,
    arrivalDateMs: launchDateMs + transferTimeSeconds * 1_000,
    originOrbitRadiusKm: originRadiusKm,
    destinationOrbitRadiusKm: destinationRadiusKm,
    transferSemiMajorAxisKm,
    meanTransferSpeedKmS,
    idealPhaseAngleDeg: radiansToDegrees(idealPhaseAngleRad),
    currentPhaseAngleDeg: radiansToDegrees(currentPhaseAngleRad),
    phaseOffsetDeg,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    launchWindowQuality,
    favorable: launchWindowQuality === "excellent" || launchWindowQuality === "good",
    approximate: true,
    targetIsMoon: false,
    notes,
  };
};

export const sampleTransferArcKm = (
  estimate: TransferEstimate,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  samples = 80,
): TransferArc | null => {
  const earth = bodiesById.get(EARTH_ID);
  const destinationBody = bodiesById.get(estimate.destinationBodyId);
  const transferTargetBody = bodiesById.get(estimate.transferTargetBodyId) ?? destinationBody;
  if (!earth || !destinationBody || !transferTargetBody) {
    return null;
  }

  const launchDate = new Date(launchDateMs);
  const arrivalDate = new Date(estimate.arrivalDateMs);
  const launchPointKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const interceptPointKm = getBodyPositionKm(transferTargetBody, bodiesById, arrivalDate);

  if (estimate.centralBodyId === "earth") {
    const destinationLocalArrivalKm = destinationBody.orbit
      ? getOrbitPositionKm(destinationBody.orbit, arrivalDate)
      : sub(interceptPointKm, getBodyPositionKm(earth, bodiesById, arrivalDate));
    const localLaunchKm: Vec3 = [0, 0, 0];
    const localChordLength = vectorLength(destinationLocalArrivalKm);
    const localLift: Vec3 = [0, Math.max(localChordLength * 0.24, EARTH_RADIUS_KM * 5), 0];
    const localControl = add(lerp(localLaunchKm, destinationLocalArrivalKm, 0.48), localLift);
    const pointsKm = Array.from({ length: samples + 1 }, (_value, index) => {
      const t = index / samples;
      const sampleDate = new Date(launchDateMs + estimate.transferTimeSeconds * 1_000 * t);
      const earthAtSampleKm = getBodyPositionKm(earth, bodiesById, sampleDate);
      return add(earthAtSampleKm, quadraticBezier(localLaunchKm, localControl, destinationLocalArrivalKm, t));
    });

    return {
      pointsKm,
      arcLengthKm: measurePolylineKm(pointsKm),
      launchPointKm,
      interceptPointKm,
    };
  }

  const chordLength = vectorLength(sub(interceptPointKm, launchPointKm));
  const controlDistance = Math.min(chordLength * 0.42, estimate.transferSemiMajorAxisKm * 0.85);
  const launchTangent = progradeTangentFromSun(launchPointKm);
  const interceptTangent = progradeTangentFromSun(interceptPointKm);
  const controlOne = add(launchPointKm, mul(launchTangent, controlDistance));
  const controlTwo = sub(interceptPointKm, mul(interceptTangent, controlDistance));

  const pointsKm = Array.from({ length: samples + 1 }, (_value, index) => {
    const t = index / samples;
    return cubicBezier(launchPointKm, controlOne, controlTwo, interceptPointKm, t);
  });

  return {
    pointsKm,
    arcLengthKm: measurePolylineKm(pointsKm),
    launchPointKm,
    interceptPointKm,
  };
};

export const interpolateTransferArcKm = (arc: TransferArc, progress: number): Vec3 => {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const scaled = clamped * (arc.pointsKm.length - 1);
  const index = Math.min(Math.floor(scaled), arc.pointsKm.length - 2);
  const localT = scaled - index;
  return lerp(arc.pointsKm[index], arc.pointsKm[index + 1], localT);
};
