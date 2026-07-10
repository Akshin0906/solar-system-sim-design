import { DAY_SECONDS, EARTH_RADIUS_KM } from "../../data/constants";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import {
  getBodyPositionKm,
  getOrbitElementsAtDate,
  getOrbitPositionKm,
} from "../../simulation/solveOrbit";
import {
  addVec3 as add,
  mulVec3 as mul,
  normalizeVec3 as normalize,
  subVec3 as sub,
  vectorLength,
} from "../../simulation/vec3";
import {
  estimateVelocityKmS,
  measureTrajectoryKm,
  propagateTwoBody,
  sampleTwoBodyTrajectory,
  solveLambertUniversal,
} from "./orbitalTransfer";
import type { RocketProfile } from "./rocketCatalog";

const EARTH_ID = "earth";
const SUN_ID = "sun";
const TWO_PI = Math.PI * 2;
const LEO_ALTITUDE_KM = 400;
const TRANSFER_ARC_SAMPLES = 120;

export type LaunchWindowQuality = "excellent" | "good" | "fair" | "poor";
export type TransferCentralBody = "sun" | "earth";
export type TransferTrajectoryModel = "hohmann" | "lambert" | "moon-hohmann";

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
  trajectoryModel: TransferTrajectoryModel;
  departurePositionKm: Vec3;
  departureVelocityKmS: Vec3;
  arrivalTrajectoryPositionKm: Vec3;
  arrivalTrajectoryVelocityKmS: Vec3;
  departureBodyVelocityKmS: Vec3;
  arrivalBodyVelocityKmS: Vec3;
  departureVInfinityKmS: number;
  arrivalVInfinityKmS: number;
  departureC3Km2S2: number;
  parkingOrbitInjectionDeltaVKmS: number | null;
  captureDeltaVKmS: number | null;
  arrivalMissDistanceKm: number;
  interceptGuaranteed: boolean;
  idealPhaseAngleDeg: number;
  currentPhaseAngleDeg: number;
  phaseOffsetDeg: number;
  // Backward-compatible summary fields. UI should prefer the explicitly named
  // parking-orbit, v-infinity, and capture fields above.
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

const qualityFromPhaseOffset = (phaseOffsetDeg: number): LaunchWindowQuality => {
  const absoluteOffset = Math.abs(phaseOffsetDeg);
  if (absoluteOffset <= 5) return "excellent";
  if (absoluteOffset <= 15) return "good";
  if (absoluteOffset <= 35) return "fair";
  return "poor";
};

const getCentralMu = (body: CelestialBody) => body.physical.gravitationalParameterKm3S2 ?? 0;

const circularSpeed = (muKm3S2: number, radiusKm: number) =>
  muKm3S2 > 0 && radiusKm > 0 ? Math.sqrt(muKm3S2 / radiusKm) : 0;

const transferSpeed = (muKm3S2: number, radiusKm: number, transferSemiMajorAxisKm: number) => {
  if (muKm3S2 <= 0 || radiusKm <= 0 || transferSemiMajorAxisKm <= 0) return 0;
  const speedSquared = muKm3S2 * (2 / radiusKm - 1 / transferSemiMajorAxisKm);
  return speedSquared > 0 ? Math.sqrt(speedSquared) : 0;
};

// In this app prograde motion advances from +X toward +Z, so the tangent in the
// ecliptic plane is [-z, 0, x].
const progradeTangent = ([x, _y, z]: Vec3): Vec3 => {
  const tangent = normalize([-z, 0, x]);
  return vectorLength(tangent) === 0 ? [0, 0, 1] : tangent;
};

const bodyVelocityAt = (
  body: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  dateMs: number,
) => estimateVelocityKmS((date) => getBodyPositionKm(body, bodiesById, date), dateMs);

const patchedConicMetrics = (
  earth: CelestialBody,
  destination: CelestialBody,
  departureVelocityKmS: Vec3,
  departureBodyVelocityKmS: Vec3,
  arrivalVelocityKmS: Vec3,
  arrivalReferenceVelocityKmS: Vec3,
) => {
  const departureVInfinityKmS = vectorLength(sub(departureVelocityKmS, departureBodyVelocityKmS));
  const arrivalVInfinityKmS = vectorLength(sub(arrivalVelocityKmS, arrivalReferenceVelocityKmS));
  const earthMu = getCentralMu(earth);
  const parkingRadiusKm = EARTH_RADIUS_KM + LEO_ALTITUDE_KM;
  const parkingOrbitInjectionDeltaVKmS =
    earthMu > 0
      ? Math.sqrt(departureVInfinityKmS ** 2 + (2 * earthMu) / parkingRadiusKm) -
        circularSpeed(earthMu, parkingRadiusKm)
      : null;
  const destinationMu = getCentralMu(destination);
  const captureRadiusKm = destination.physical.radiusKm + Math.max(destination.physical.radiusKm * 0.05, 200);
  const captureDeltaVKmS =
    destinationMu > 0
      ? Math.sqrt(arrivalVInfinityKmS ** 2 + (2 * destinationMu) / captureRadiusKm) -
        circularSpeed(destinationMu, captureRadiusKm)
      : null;

  return {
    departureVInfinityKmS,
    arrivalVInfinityKmS,
    departureC3Km2S2: departureVInfinityKmS ** 2,
    parkingOrbitInjectionDeltaVKmS,
    captureDeltaVKmS,
  };
};

const estimateLocalMoonTransfer = (
  earth: CelestialBody,
  destination: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  profile?: RocketProfile | null,
): TransferEstimate | null => {
  if (!destination.orbit) return null;
  const muEarth = getCentralMu(earth);
  if (muEarth <= 0) return null;

  const launchDate = new Date(launchDateMs);
  const orbit = getOrbitElementsAtDate(destination.orbit, launchDate);
  const originRadiusKm = EARTH_RADIUS_KM + LEO_ALTITUDE_KM;
  const destinationRadiusKm = orbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const transferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muEarth);
  if (!Number.isFinite(transferTimeSeconds) || transferTimeSeconds <= 0) return null;

  const arrivalDateMs = launchDateMs + transferTimeSeconds * 1_000;
  const arrivalDate = new Date(arrivalDateMs);
  const moonAtArrivalLocalKm = getOrbitPositionKm(destination.orbit, arrivalDate);
  const departureLocalPositionKm = mul(normalize(moonAtArrivalLocalKm), -originRadiusKm);
  const departureLocalSpeedKmS = transferSpeed(muEarth, originRadiusKm, transferSemiMajorAxisKm);
  const departureLocalVelocityKmS = mul(progradeTangent(departureLocalPositionKm), departureLocalSpeedKmS);
  const arrivalLocalState = propagateTwoBody(
    departureLocalPositionKm,
    departureLocalVelocityKmS,
    transferTimeSeconds,
    muEarth,
  );
  const localPoints = sampleTwoBodyTrajectory(
    departureLocalPositionKm,
    departureLocalVelocityKmS,
    transferTimeSeconds,
    muEarth,
    TRANSFER_ARC_SAMPLES,
  );
  if (!arrivalLocalState || !localPoints) return null;

  const earthDepartureKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const earthArrivalKm = getBodyPositionKm(earth, bodiesById, arrivalDate);
  const earthDepartureVelocityKmS = bodyVelocityAt(earth, bodiesById, launchDateMs);
  const earthArrivalVelocityKmS = bodyVelocityAt(earth, bodiesById, arrivalDateMs);
  const destinationArrivalKm = getBodyPositionKm(destination, bodiesById, arrivalDate);
  const destinationArrivalVelocityKmS = bodyVelocityAt(destination, bodiesById, arrivalDateMs);
  const departurePositionKm = add(earthDepartureKm, departureLocalPositionKm);
  const departureVelocityKmS = add(earthDepartureVelocityKmS, departureLocalVelocityKmS);
  const arrivalTrajectoryPositionKm = add(earthArrivalKm, arrivalLocalState.positionKm);
  const arrivalTrajectoryVelocityKmS = add(earthArrivalVelocityKmS, arrivalLocalState.velocityKmS);
  const inertialPoints = localPoints.map((point, index) =>
    add(
      getBodyPositionKm(
        earth,
        bodiesById,
        new Date(launchDateMs + (transferTimeSeconds * 1_000 * index) / TRANSFER_ARC_SAMPLES),
      ),
      point,
    ),
  );

  const moonMeanMotion = TWO_PI / (Math.abs(orbit.orbitalPeriodDays) * DAY_SECONDS);
  const idealPhaseAngleRad = normalizeSignedRadians(Math.PI - moonMeanMotion * transferTimeSeconds);
  const currentPhaseAngleRad = normalizeSignedRadians(
    angleFromSun(getOrbitPositionKm(destination.orbit, launchDate)),
  );
  const phaseOffsetDeg = radiansToDegrees(
    normalizeSignedRadians(currentPhaseAngleRad - idealPhaseAngleRad),
  );
  const launchWindowQuality = qualityFromPhaseOffset(phaseOffsetDeg);
  const departureDeltaVKmS = Math.abs(
    departureLocalSpeedKmS - circularSpeed(muEarth, originRadiusKm),
  );
  const arrivalDeltaVKmS = Math.abs(
    circularSpeed(muEarth, destinationRadiusKm) -
      transferSpeed(muEarth, destinationRadiusKm, transferSemiMajorAxisKm),
  );
  const arrivalVInfinityKmS = vectorLength(
    sub(arrivalTrajectoryVelocityKmS, destinationArrivalVelocityKmS),
  );

  return {
    centralBodyId: "earth",
    originBodyId: EARTH_ID,
    destinationBodyId: destination.id,
    transferTargetBodyId: destination.id,
    transferTimeSeconds,
    arrivalDateMs,
    originOrbitRadiusKm: originRadiusKm,
    destinationOrbitRadiusKm: destinationRadiusKm,
    transferSemiMajorAxisKm,
    meanTransferSpeedKmS: measureTrajectoryKm(inertialPoints) / transferTimeSeconds,
    trajectoryModel: "moon-hohmann",
    departurePositionKm,
    departureVelocityKmS,
    arrivalTrajectoryPositionKm,
    arrivalTrajectoryVelocityKmS,
    departureBodyVelocityKmS: earthDepartureVelocityKmS,
    arrivalBodyVelocityKmS: destinationArrivalVelocityKmS,
    departureVInfinityKmS: departureDeltaVKmS,
    arrivalVInfinityKmS,
    departureC3Km2S2: 0,
    parkingOrbitInjectionDeltaVKmS: departureDeltaVKmS,
    captureDeltaVKmS: arrivalDeltaVKmS,
    arrivalMissDistanceKm: vectorLength(sub(arrivalTrajectoryPositionKm, destinationArrivalKm)),
    interceptGuaranteed: false,
    idealPhaseAngleDeg: radiansToDegrees(idealPhaseAngleRad),
    currentPhaseAngleDeg: radiansToDegrees(currentPhaseAngleRad),
    phaseOffsetDeg,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    launchWindowQuality,
    favorable: launchWindowQuality === "excellent" || launchWindowQuality === "good",
    approximate: true,
    targetIsMoon: true,
    notes: [
      "Two-body Earth-centered Hohmann coast. Poor phase alignment produces a propagated miss.",
      `${profile?.name ?? "The selected vehicle"} is an identity label here; its illustrative cruise profile does not alter the conic.`,
    ],
  };
};

const estimatePlanetTransfer = (
  earth: CelestialBody,
  sun: CelestialBody,
  destination: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  profile: RocketProfile | null | undefined,
  trajectoryModel: "hohmann" | "lambert",
): TransferEstimate | null => {
  if (!earth.orbit || !destination.orbit || destination.parentId !== SUN_ID) return null;
  const muSun = getCentralMu(sun);
  if (muSun <= 0) return null;

  const launchDate = new Date(launchDateMs);
  const destinationOrbit = getOrbitElementsAtDate(destination.orbit, launchDate);
  const departurePositionKm = getBodyPositionKm(earth, bodiesById, launchDate);
  const departureBodyVelocityKmS = bodyVelocityAt(earth, bodiesById, launchDateMs);
  const originRadiusKm = vectorLength(departurePositionKm);
  const destinationRadiusKm = destinationOrbit.semiMajorAxisKm;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const baselineTransferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / muSun);
  if (!Number.isFinite(baselineTransferTimeSeconds) || baselineTransferTimeSeconds <= 0) return null;

  const candidates =
    trajectoryModel === "lambert"
      ? [1, 0.96, 1.04, 0.9, 1.1].map((factor) => baselineTransferTimeSeconds * factor)
      : [baselineTransferTimeSeconds];
  let transferTimeSeconds = candidates[0];
  let arrivalDateMs = launchDateMs + transferTimeSeconds * 1_000;
  let targetArrivalKm = getBodyPositionKm(destination, bodiesById, new Date(arrivalDateMs));
  let departureVelocityKmS = mul(
    progradeTangent(departurePositionKm),
    transferSpeed(muSun, originRadiusKm, transferSemiMajorAxisKm),
  );
  let arrivalTrajectoryPositionKm: Vec3 | null = null;
  let arrivalTrajectoryVelocityKmS: Vec3 | null = null;
  let interceptGuaranteed = false;

  if (trajectoryModel === "lambert") {
    for (const candidateSeconds of candidates) {
      const candidateArrivalDateMs = launchDateMs + candidateSeconds * 1_000;
      const candidateTargetKm = getBodyPositionKm(destination, bodiesById, new Date(candidateArrivalDateMs));
      const solution = solveLambertUniversal(
        departurePositionKm,
        candidateTargetKm,
        candidateSeconds,
        muSun,
        true,
      );
      if (!solution) continue;
      transferTimeSeconds = candidateSeconds;
      arrivalDateMs = candidateArrivalDateMs;
      targetArrivalKm = candidateTargetKm;
      departureVelocityKmS = solution.departureVelocityKmS;
      arrivalTrajectoryPositionKm = candidateTargetKm;
      arrivalTrajectoryVelocityKmS = solution.arrivalVelocityKmS;
      interceptGuaranteed = true;
      break;
    }
  } else {
    const arrivalState = propagateTwoBody(
      departurePositionKm,
      departureVelocityKmS,
      transferTimeSeconds,
      muSun,
    );
    if (arrivalState) {
      arrivalTrajectoryPositionKm = arrivalState.positionKm;
      arrivalTrajectoryVelocityKmS = arrivalState.velocityKmS;
    }
  }
  if (!arrivalTrajectoryPositionKm || !arrivalTrajectoryVelocityKmS) return null;

  const trajectoryPoints = sampleTwoBodyTrajectory(
    departurePositionKm,
    departureVelocityKmS,
    transferTimeSeconds,
    muSun,
    TRANSFER_ARC_SAMPLES,
  );
  if (!trajectoryPoints) return null;

  const arrivalBodyVelocityKmS = bodyVelocityAt(destination, bodiesById, arrivalDateMs);
  const idealHohmannArrivalVelocityKmS = mul(
    progradeTangent(arrivalTrajectoryPositionKm),
    circularSpeed(muSun, destinationRadiusKm),
  );
  const patchedConic = patchedConicMetrics(
    earth,
    destination,
    departureVelocityKmS,
    departureBodyVelocityKmS,
    arrivalTrajectoryVelocityKmS,
    trajectoryModel === "lambert" ? arrivalBodyVelocityKmS : idealHohmannArrivalVelocityKmS,
  );
  const targetAtLaunchKm = getBodyPositionKm(destination, bodiesById, launchDate);
  const targetMeanMotion = TWO_PI / (Math.abs(destinationOrbit.orbitalPeriodDays) * DAY_SECONDS);
  const idealPhaseAngleRad = normalizeSignedRadians(Math.PI - targetMeanMotion * transferTimeSeconds);
  const currentPhaseAngleRad = normalizeSignedRadians(
    angleFromSun(targetAtLaunchKm) - angleFromSun(departurePositionKm),
  );
  const phaseOffsetDeg = radiansToDegrees(
    normalizeSignedRadians(currentPhaseAngleRad - idealPhaseAngleRad),
  );
  const launchWindowQuality = qualityFromPhaseOffset(phaseOffsetDeg);

  return {
    centralBodyId: "sun",
    originBodyId: EARTH_ID,
    destinationBodyId: destination.id,
    transferTargetBodyId: destination.id,
    transferTimeSeconds,
    arrivalDateMs,
    originOrbitRadiusKm: originRadiusKm,
    destinationOrbitRadiusKm: destinationRadiusKm,
    transferSemiMajorAxisKm,
    meanTransferSpeedKmS: measureTrajectoryKm(trajectoryPoints) / transferTimeSeconds,
    trajectoryModel,
    departurePositionKm,
    departureVelocityKmS,
    arrivalTrajectoryPositionKm,
    arrivalTrajectoryVelocityKmS,
    departureBodyVelocityKmS,
    arrivalBodyVelocityKmS,
    ...patchedConic,
    arrivalMissDistanceKm: vectorLength(sub(arrivalTrajectoryPositionKm, targetArrivalKm)),
    interceptGuaranteed,
    idealPhaseAngleDeg: radiansToDegrees(idealPhaseAngleRad),
    currentPhaseAngleDeg: radiansToDegrees(currentPhaseAngleRad),
    phaseOffsetDeg,
    departureDeltaVKmS:
      patchedConic.parkingOrbitInjectionDeltaVKmS ?? patchedConic.departureVInfinityKmS,
    arrivalDeltaVKmS: patchedConic.captureDeltaVKmS ?? patchedConic.arrivalVInfinityKmS,
    launchWindowQuality,
    favorable:
      trajectoryModel === "lambert" || launchWindowQuality === "excellent" || launchWindowQuality === "good",
    approximate: true,
    targetIsMoon: false,
    notes: [
      trajectoryModel === "lambert"
        ? "Lambert targeting connects the app's dated departure and arrival model states. Required velocity may exceed the selected launcher's capability."
        : "Two-body Hohmann coast. Poor phase alignment produces a propagated miss instead of snapping to the destination.",
      `${profile?.name ?? "The selected vehicle"} is reported separately from trajectory requirements; no free cruise speed is added.`,
    ],
  };
};

export const estimateTransfer = (
  destinationBody: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  profile?: RocketProfile | null,
  trajectoryModel: "hohmann" | "lambert" = "hohmann",
): TransferEstimate | null => {
  const earth = bodiesById.get(EARTH_ID);
  const sun = bodiesById.get(SUN_ID);
  if (!earth || !sun || destinationBody.id === EARTH_ID) return null;
  if (destinationBody.type === "moon") {
    return destinationBody.parentId === EARTH_ID
      ? estimateLocalMoonTransfer(earth, destinationBody, bodiesById, launchDateMs, profile)
      : null;
  }
  return estimatePlanetTransfer(
    earth,
    sun,
    destinationBody,
    bodiesById,
    launchDateMs,
    profile,
    trajectoryModel,
  );
};

export const sampleTransferArcKm = (
  estimate: TransferEstimate,
  bodiesById: Map<string, CelestialBody>,
  launchDateMs: number,
  samples = TRANSFER_ARC_SAMPLES,
): TransferArc | null => {
  const earth = bodiesById.get(EARTH_ID);
  const destination = bodiesById.get(estimate.destinationBodyId);
  const target = bodiesById.get(estimate.transferTargetBodyId) ?? destination;
  if (!earth || !destination || !target) return null;
  const interceptPointKm = getBodyPositionKm(target, bodiesById, new Date(estimate.arrivalDateMs));

  if (estimate.centralBodyId === "earth") {
    const earthLaunchKm = getBodyPositionKm(earth, bodiesById, new Date(launchDateMs));
    const earthLaunchVelocityKmS = bodyVelocityAt(earth, bodiesById, launchDateMs);
    const localPositionKm = sub(estimate.departurePositionKm, earthLaunchKm);
    const localVelocityKmS = sub(estimate.departureVelocityKmS, earthLaunchVelocityKmS);
    const localPoints = sampleTwoBodyTrajectory(
      localPositionKm,
      localVelocityKmS,
      estimate.transferTimeSeconds,
      getCentralMu(earth),
      samples,
    );
    if (!localPoints) return null;
    const pointsKm = localPoints.map((point, index) =>
      add(
        getBodyPositionKm(
          earth,
          bodiesById,
          new Date(launchDateMs + (estimate.transferTimeSeconds * 1_000 * index) / samples),
        ),
        point,
      ),
    );
    return {
      pointsKm,
      arcLengthKm: measureTrajectoryKm(pointsKm),
      launchPointKm: estimate.departurePositionKm,
      interceptPointKm,
    };
  }

  const sun = bodiesById.get(SUN_ID);
  if (!sun) return null;
  const pointsKm = sampleTwoBodyTrajectory(
    estimate.departurePositionKm,
    estimate.departureVelocityKmS,
    estimate.transferTimeSeconds,
    getCentralMu(sun),
    samples,
  );
  return pointsKm
    ? {
        pointsKm,
        arcLengthKm: measureTrajectoryKm(pointsKm),
        launchPointKm: estimate.departurePositionKm,
        interceptPointKm,
      }
    : null;
};

export const interpolateTransferArcKm = (arc: TransferArc, progress: number): Vec3 => {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const scaled = clamped * (arc.pointsKm.length - 1);
  const index = Math.min(Math.floor(scaled), arc.pointsKm.length - 2);
  const localT = scaled - index;
  const start = arc.pointsKm[index];
  const end = arc.pointsKm[index + 1];
  return [
    start[0] + (end[0] - start[0]) * localT,
    start[1] + (end[1] - start[1]) * localT,
    start[2] + (end[2] - start[2]) * localT,
  ];
};
