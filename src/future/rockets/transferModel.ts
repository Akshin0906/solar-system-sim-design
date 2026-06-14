import { DAY_SECONDS, EARTH_RADIUS_KM } from "../../data/constants";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, getOrbitPositionKm, vectorLength } from "../../simulation/solveOrbit";

const EARTH_ID = "earth";
const SUN_ID = "sun";
const TWO_PI = Math.PI * 2;
const LEO_ALTITUDE_KM = 400;

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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const quadraticBezier = (a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 => {
  const ab = lerp(a, b, t);
  const bc = lerp(b, c, t);
  return lerp(ab, bc, t);
};

const measurePolylineKm = (points: Vec3[]) =>
  points.reduce((distance, point, index) => {
    if (index === 0) {
      return distance;
    }
    return distance + vectorLength(sub(point, points[index - 1]));
  }, 0);

const correctArcEndpoints = (points: Vec3[], launchPointKm: Vec3, interceptPointKm: Vec3): Vec3[] => {
  if (points.length < 2) {
    return points;
  }

  const startCorrection = sub(launchPointKm, points[0]);
  const endCorrection = sub(interceptPointKm, points[points.length - 1]);
  const lastIndex = points.length - 1;

  return points.map((point, index) => {
    const t = index / lastIndex;
    return add(add(point, mul(startCorrection, 1 - t)), mul(endCorrection, t));
  });
};

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

const getTransferTarget = (destinationBody: CelestialBody, bodiesById: Map<string, CelestialBody>) => {
  if (destinationBody.type === "moon" && destinationBody.parentId && destinationBody.parentId !== EARTH_ID) {
    return bodiesById.get(destinationBody.parentId) ?? destinationBody;
  }
  return destinationBody;
};

const estimateLocalMoonTransfer = (
  earth: CelestialBody,
  destinationBody: CelestialBody,
  launchDateMs: number,
): TransferEstimate | null => {
  if (!destinationBody.orbit) {
    return null;
  }

  const muEarth = getCentralMu(earth);
  if (muEarth <= 0) {
    return null;
  }

  const originRadiusKm = EARTH_RADIUS_KM + LEO_ALTITUDE_KM;
  const destinationRadiusKm = destinationBody.orbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const transferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muEarth);
  const departureDeltaVKmS = Math.abs(
    transferSpeed(muEarth, originRadiusKm, transferSemiMajorAxisKm) - circularSpeed(muEarth, originRadiusKm),
  );
  const arrivalDeltaVKmS = Math.abs(
    circularSpeed(muEarth, destinationRadiusKm) -
      transferSpeed(muEarth, destinationRadiusKm, transferSemiMajorAxisKm),
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
    idealPhaseAngleDeg: 42,
    currentPhaseAngleDeg: 42,
    phaseOffsetDeg: 0,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    launchWindowQuality: "good",
    favorable: true,
    approximate: true,
    targetIsMoon: true,
    notes: ["Moon transfer uses a simplified Earth-centered parking-orbit estimate."],
  };
};

export const estimateTransfer = (
  destinationBody: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
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
    return estimateLocalMoonTransfer(earth, destinationBody, launchDateMs);
  }

  const transferTarget = getTransferTarget(destinationBody, bodiesById);
  if (!transferTarget.orbit || transferTarget.parentId !== SUN_ID) {
    return null;
  }

  const muSun = getCentralMu(sun);
  if (muSun <= 0) {
    return null;
  }

  const originRadiusKm = earth.orbit.semiMajorAxisKm;
  const destinationRadiusKm = transferTarget.orbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const transferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muSun);
  const targetMeanMotion = TWO_PI / (Math.abs(transferTarget.orbit.orbitalPeriodDays) * DAY_SECONDS);
  const idealPhaseAngleRad = normalizeSignedRadians(Math.PI - targetMeanMotion * transferTimeSeconds);

  const launchDate = new Date(launchDateMs);
  const earthKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const targetKm = getBodyPositionKm(transferTarget, bodiesById, launchDate);
  const currentPhaseAngleRad = normalizeSignedRadians(angleFromSun(targetKm) - angleFromSun(earthKm));
  const phaseOffsetRad = normalizeSignedRadians(currentPhaseAngleRad - idealPhaseAngleRad);
  const phaseOffsetDeg = radiansToDegrees(phaseOffsetRad);
  const launchWindowQuality = qualityFromPhaseOffset(phaseOffsetDeg);

  const departureDeltaVKmS = Math.abs(
    transferSpeed(muSun, originRadiusKm, transferSemiMajorAxisKm) - circularSpeed(muSun, originRadiusKm),
  );
  const arrivalDeltaVKmS = Math.abs(
    circularSpeed(muSun, destinationRadiusKm) -
      transferSpeed(muSun, destinationRadiusKm, transferSemiMajorAxisKm),
  );

  const notes =
    transferTarget.id === destinationBody.id
      ? ["Hohmann estimate assumes circular, coplanar heliocentric orbits."]
      : [
          `Transfer estimate targets ${transferTarget.name}'s heliocentric orbit; local moon capture is not modeled.`,
          "Hohmann estimate assumes circular, coplanar heliocentric orbits.",
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
    idealPhaseAngleDeg: radiansToDegrees(idealPhaseAngleRad),
    currentPhaseAngleDeg: radiansToDegrees(currentPhaseAngleRad),
    phaseOffsetDeg,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    launchWindowQuality,
    favorable: launchWindowQuality === "excellent" || launchWindowQuality === "good",
    approximate: true,
    targetIsMoon: destinationBody.type === "moon",
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
  if (!earth || !destinationBody) {
    return null;
  }

  const launchDate = new Date(launchDateMs);
  const arrivalDate = new Date(estimate.arrivalDateMs);
  const launchPointKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const interceptPointKm = getBodyPositionKm(
    bodiesById.get(estimate.transferTargetBodyId) ?? destinationBody,
    bodiesById,
    arrivalDate,
  );

  if (estimate.centralBodyId === "earth") {
    const chord = sub(interceptPointKm, launchPointKm);
    const chordLength = vectorLength(chord);
    const lift: Vec3 = [0, Math.max(chordLength * 0.24, EARTH_RADIUS_KM * 8), 0];
    const control = add(lerp(launchPointKm, interceptPointKm, 0.48), lift);
    const pointsKm = Array.from({ length: samples + 1 }, (_value, index) =>
      quadraticBezier(launchPointKm, control, interceptPointKm, index / samples),
    );

    return {
      pointsKm,
      arcLengthKm: measurePolylineKm(pointsKm),
      launchPointKm,
      interceptPointKm,
    };
  }

  const earthLocalKm = getOrbitPositionKm(earth.orbit!, launchDate);
  const launchAngle = angleFromSun(earthLocalKm);
  const outward = estimate.destinationOrbitRadiusKm >= estimate.originOrbitRadiusKm;
  const eccentricity =
    Math.abs(estimate.destinationOrbitRadiusKm - estimate.originOrbitRadiusKm) /
    (estimate.destinationOrbitRadiusKm + estimate.originOrbitRadiusKm);
  const semiMajorAxis = estimate.transferSemiMajorAxisKm;
  const parameter = semiMajorAxis * (1 - eccentricity * eccentricity);
  const periapsisAngle = outward ? launchAngle : launchAngle - Math.PI;

  const idealPointsKm = Array.from({ length: samples + 1 }, (_value, index) => {
    const t = index / samples;
    const trueAnomaly = outward ? t * Math.PI : Math.PI - t * Math.PI;
    const radiusKm = parameter / (1 + eccentricity * Math.cos(trueAnomaly));
    const angle = periapsisAngle + trueAnomaly;
    return [Math.cos(angle) * radiusKm, 0, Math.sin(angle) * radiusKm] as Vec3;
  });
  const pointsKm = correctArcEndpoints(idealPointsKm, launchPointKm, interceptPointKm);

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
