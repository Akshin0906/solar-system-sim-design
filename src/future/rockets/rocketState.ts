import { bodiesById } from "../../data";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";
import {
  computeBodyScenePosition,
  getBodySceneRadius,
  scaleDistanceFromSun,
  scaleVectorFromSun,
  type ScaleMode,
} from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import { sampleFlight } from "./flightModel";
import { applyLaunchModeToProfile, type RocketLaunchMode, type RocketMissionMode } from "./missionOptions";
import type { RocketProfile } from "./rocketCatalog";
import {
  estimateTransfer,
  interpolateTransferArcKm,
  sampleTransferArcKm,
  type TransferArc,
  type TransferEstimate,
} from "./transferModel";

// Composition layer: turns a launched rocket, mission mode, destination, launch
// assumption, and current simulation time into a scale-independent scene/telemetry
// view. It never mutates celestial body data.
//
// Direct aim is the original educational model: freeze the target's launch-time
// position and fly a straight line toward it. Transfer preview is a separate
// approximate Hohmann-style model: compute transfer-window math once per launch,
// draw a curved transfer arc, and place the rocket along that arc by elapsed time.

const EARTH_ID = "earth";

const DEPART_FROM_EARTH_KM = 1_000_000;
const DIRECT_DEPART_PROGRESS = 0.06;
const DIRECT_APPROACH_FRACTION = 0.25;
const CLOSEST_APPROACH_SAMPLES = 40;
const TRANSFER_CACHE_LIMIT = 16;

export type MissionStatus =
  | "pre-launch"
  | "burn"
  | "coast"
  | "transfer"
  | "approach"
  | "flyby"
  | "arrived"
  | "missed";

export const missionStatusLabel: Record<MissionStatus, string> = {
  "pre-launch": "Pre-launch",
  burn: "Burn",
  coast: "Coast",
  transfer: "Transfer",
  approach: "Approach",
  flyby: "Flyby",
  arrived: "Arrived",
  missed: "Missed",
};

export type RocketDestinationView = {
  bodyId: string;
  label: string;
  distanceToTargetKm: number;
  etaSeconds: number | null;
  closestApproachKm: number;
  destScenePosition: Vec3;
  destSceneRadius: number;
};

export type RocketTransferView = {
  estimate: TransferEstimate;
  arcScenePoints: Vec3[];
  progress: number;
  arcLengthKm: number;
  interceptScenePosition: Vec3;
  targetArrivalScenePosition: Vec3;
};

export type RocketView = {
  elapsedSeconds: number;
  speedKmS: number;
  distanceTraveledKm: number;
  distanceFromEarthKm: number;
  status: MissionStatus;
  missionMode: RocketMissionMode;
  launchMode: RocketLaunchMode;
  scenePosition: Vec3;
  launchScenePosition: Vec3;
  sceneDirection: Vec3;
  destination: RocketDestinationView | null;
  transfer: RocketTransferView | null;
};

type CachedTransferPlan = {
  estimate: TransferEstimate;
  arc: TransferArc;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const normalize = (v: Vec3): Vec3 => {
  const length = vectorLength(v);
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
};

const interpolatePoints = (points: Vec3[], progress: number): Vec3 => {
  if (points.length === 0) {
    return [0, 0, 0];
  }
  if (points.length === 1) {
    return points[0];
  }
  const scaled = clamp01(progress) * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  return lerp(points[index], points[index + 1], scaled - index);
};

const directionAlongPoints = (points: Vec3[], progress: number): Vec3 => {
  if (points.length < 2) {
    return [0, 1, 0];
  }
  const scaled = clamp01(progress) * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  return normalize(sub(points[index + 1], points[index]));
};

const getDirectStatus = (
  elapsedSeconds: number,
  burnDurationSeconds: number,
  progress: number,
  closing: boolean,
  distanceToTargetKm: number,
  closestApproachKm: number,
  aimDistanceKm: number,
  targetBody: CelestialBody,
): MissionStatus => {
  if (elapsedSeconds < burnDurationSeconds) {
    return "burn";
  }
  if (progress < DIRECT_DEPART_PROGRESS) {
    return "coast";
  }
  if (closing && distanceToTargetKm < DIRECT_APPROACH_FRACTION * aimDistanceKm) {
    return "approach";
  }
  if (progress >= 1) {
    const closePassKm = Math.max(targetBody.physical.radiusKm * 120, aimDistanceKm * 0.015);
    return closestApproachKm <= closePassKm ? "flyby" : "missed";
  }
  return "coast";
};

/** Straight-line distance from the rocket to the moving destination at mission time tau. */
const distanceToDestAt = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  tau: number,
): number => {
  const traveled = sampleFlight(profile, tau).distanceTraveledKm;
  const rocketKm = add(launchOriginKm, mul(physicalDir, traveled));
  const destKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + tau * 1_000));
  return vectorLength(sub(rocketKm, destKm));
};

const closestDirectApproachSoFar = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  elapsedSeconds: number,
  currentDistanceKm: number,
): number => {
  let closestKm = currentDistanceKm;
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (elapsedSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const distance = distanceToDestAt(profile, launchOriginKm, physicalDir, destBody, launchDateMs, tau);
    if (distance < closestKm) {
      closestKm = distance;
    }
  }
  return closestKm;
};

const transferPlanCache = new Map<string, CachedTransferPlan>();

const getTransferPlan = (destBody: CelestialBody, launchDateMs: number): CachedTransferPlan | null => {
  const key = `${destBody.id}|${launchDateMs}`;
  const cached = transferPlanCache.get(key);
  if (cached) {
    return cached;
  }

  const estimate = estimateTransfer(destBody, bodiesById, launchDateMs);
  if (!estimate) {
    return null;
  }
  const arc = sampleTransferArcKm(estimate, bodiesById, launchDateMs);
  if (!arc) {
    return null;
  }

  const plan = { estimate, arc };
  if (transferPlanCache.size >= TRANSFER_CACHE_LIMIT) {
    const oldest = transferPlanCache.keys().next().value;
    if (oldest !== undefined) {
      transferPlanCache.delete(oldest);
    }
  }
  transferPlanCache.set(key, plan);
  return plan;
};

const closestTransferApproachSoFar = (
  arc: TransferArc,
  estimate: TransferEstimate,
  destBody: CelestialBody,
  launchDateMs: number,
  elapsedSeconds: number,
  currentDistanceKm: number,
): number => {
  let closestKm = currentDistanceKm;
  const cappedElapsed = Math.min(elapsedSeconds, estimate.transferTimeSeconds);
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (cappedElapsed * index) / CLOSEST_APPROACH_SAMPLES;
    const progress = estimate.transferTimeSeconds > 0 ? tau / estimate.transferTimeSeconds : 0;
    const rocketKm = interpolateTransferArcKm(arc, progress);
    const destKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + tau * 1_000));
    const distance = vectorLength(sub(rocketKm, destKm));
    if (distance < closestKm) {
      closestKm = distance;
    }
  }
  return closestKm;
};

const makeLocalTransferSceneArc = (launchScene: Vec3, arrivalScene: Vec3, samples: number): Vec3[] => {
  const chord = sub(arrivalScene, launchScene);
  const lift = Math.max(vectorLength(chord) * 0.28, 0.36);
  const control = add(lerp(launchScene, arrivalScene, 0.48), [0, lift, 0]);
  const points: Vec3[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const ab = lerp(launchScene, control, t);
    const bc = lerp(control, arrivalScene, t);
    points.push(lerp(ab, bc, t));
  }

  return points;
};

const getTransferSceneArc = (
  plan: CachedTransferPlan,
  launchScene: Vec3,
  arrivalScene: Vec3,
  mode: ScaleMode,
): Vec3[] => {
  if (plan.estimate.centralBodyId === "earth") {
    return makeLocalTransferSceneArc(launchScene, arrivalScene, plan.arc.pointsKm.length - 1);
  }
  return plan.arc.pointsKm.map((point) => scaleVectorFromSun(point, mode));
};

const buildFreeFlightView = (
  profile: RocketProfile,
  launchMode: RocketLaunchMode,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  earthLaunchKm: Vec3,
  earthNowKm: Vec3,
  earthLaunchScene: Vec3,
): RocketView => {
  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const adjustedProfile = applyLaunchModeToProfile(profile, launchMode);
  const flight = sampleFlight(adjustedProfile, elapsedSeconds);
  const physicalDir = normalize(earthLaunchKm);
  const launchRadiusKm = vectorLength(earthLaunchKm);
  const rocketRadiusKm = launchRadiusKm + flight.distanceTraveledKm;
  const scenePosition = mul(physicalDir, scaleDistanceFromSun(rocketRadiusKm, mode));
  const rocketHelioKm = add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const distanceFromEarthKm = vectorLength(sub(rocketHelioKm, earthNowKm));
  const preLaunch = simulationDateMs < launchDateMs;

  return {
    elapsedSeconds,
    speedKmS: flight.speedKmS,
    distanceTraveledKm: flight.distanceTraveledKm,
    distanceFromEarthKm,
    status: preLaunch ? "pre-launch" : distanceFromEarthKm < DEPART_FROM_EARTH_KM ? "burn" : "coast",
    missionMode: "direct",
    launchMode,
    scenePosition,
    launchScenePosition: earthLaunchScene,
    sceneDirection: normalize(earthLaunchScene),
    destination: null,
    transfer: null,
  };
};

export const computeRocketView = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  destination: RocketDestination | null,
  missionMode: RocketMissionMode = "direct",
  launchMode: RocketLaunchMode = "earth-departure",
): RocketView => {
  const launchDate = new Date(launchDateMs);
  const simDate = new Date(simulationDateMs);
  const earth = bodiesById.get(EARTH_ID);
  const earthLaunchKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, launchDate) : [0, 0, 0];
  const earthNowKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, simDate) : [0, 0, 0];
  const earthLaunchScene: Vec3 = earth
    ? computeBodyScenePosition(earth, bodiesById, launchDate, mode)
    : [0, 0, 0];
  const destBody = destination?.bodyId ? bodiesById.get(destination.bodyId) : undefined;

  if (!destBody || !destination) {
    return buildFreeFlightView(
      profile,
      launchMode,
      launchDateMs,
      simulationDateMs,
      mode,
      earthLaunchKm,
      earthNowKm,
      earthLaunchScene,
    );
  }

  if (missionMode === "transfer") {
    const plan = getTransferPlan(destBody, launchDateMs);
    if (plan) {
      const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
      const progress = clamp01(elapsedSeconds / plan.estimate.transferTimeSeconds);
      const arrivalDate = new Date(plan.estimate.arrivalDateMs);
      const transferTargetBody = bodiesById.get(plan.estimate.transferTargetBodyId) ?? destBody;
      const targetArrivalScenePosition = computeBodyScenePosition(destBody, bodiesById, arrivalDate, mode);
      const interceptScenePosition = computeBodyScenePosition(transferTargetBody, bodiesById, arrivalDate, mode);
      const arcScenePoints = getTransferSceneArc(plan, earthLaunchScene, targetArrivalScenePosition, mode);
      const scenePosition = interpolatePoints(arcScenePoints, progress);
      const sceneDirection = directionAlongPoints(arcScenePoints, progress);
      const rocketHelioKm = interpolateTransferArcKm(plan.arc, progress);
      const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
      const distanceToTargetKm = vectorLength(sub(destNowKm, rocketHelioKm));
      const closestApproachKm = closestTransferApproachSoFar(
        plan.arc,
        plan.estimate,
        destBody,
        launchDateMs,
        elapsedSeconds,
        distanceToTargetKm,
      );
      const remainingSeconds = (plan.estimate.arrivalDateMs - simulationDateMs) / 1_000;
      const preLaunch = simulationDateMs < launchDateMs;
      const averageSpeedKmS = plan.arc.arcLengthKm / plan.estimate.transferTimeSeconds;
      const burnEndSeconds = Math.min(
        applyLaunchModeToProfile(profile, launchMode).burnDurationSeconds,
        plan.estimate.transferTimeSeconds * 0.12,
      );
      let status: MissionStatus;
      if (preLaunch) {
        status = "pre-launch";
      } else if (elapsedSeconds < burnEndSeconds) {
        status = "burn";
      } else if (progress < 0.82) {
        status = "transfer";
      } else if (progress < 1) {
        status = "approach";
      } else {
        status = plan.estimate.favorable ? "arrived" : "missed";
      }

      return {
        elapsedSeconds,
        speedKmS: averageSpeedKmS,
        distanceTraveledKm: plan.arc.arcLengthKm * progress,
        distanceFromEarthKm: vectorLength(sub(rocketHelioKm, earthNowKm)),
        status,
        missionMode,
        launchMode,
        scenePosition,
        launchScenePosition: earthLaunchScene,
        sceneDirection,
        destination: {
          bodyId: destBody.id,
          label: destination.label,
          distanceToTargetKm,
          etaSeconds: remainingSeconds > 0 ? remainingSeconds : null,
          closestApproachKm,
          destScenePosition: computeBodyScenePosition(destBody, bodiesById, simDate, mode),
          destSceneRadius: getBodySceneRadius(destBody, mode),
        },
        transfer: {
          estimate: plan.estimate,
          arcScenePoints,
          progress,
          arcLengthKm: plan.arc.arcLengthKm,
          interceptScenePosition,
          targetArrivalScenePosition,
        },
      };
    }
  }

  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const adjustedProfile = applyLaunchModeToProfile(profile, launchMode);
  const flight = sampleFlight(adjustedProfile, elapsedSeconds);
  const destLaunchKm = getBodyPositionKm(destBody, bodiesById, launchDate);
  const toTarget = sub(destLaunchKm, earthLaunchKm);
  const aimDistanceKm = vectorLength(toTarget) || 1;
  const physicalDir = normalize(toTarget);
  const destLaunchScene = computeBodyScenePosition(destBody, bodiesById, launchDate, mode);
  const progress = flight.distanceTraveledKm / aimDistanceKm;
  const scenePosition = lerp(earthLaunchScene, destLaunchScene, progress);
  const rocketHelioKm = add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
  const distanceToTargetKm = vectorLength(sub(destNowKm, rocketHelioKm));
  const closestApproachKm = closestDirectApproachSoFar(
    adjustedProfile,
    earthLaunchKm,
    physicalDir,
    destBody,
    launchDateMs,
    elapsedSeconds,
    distanceToTargetKm,
  );
  const previousDistanceKm = distanceToDestAt(
    adjustedProfile,
    earthLaunchKm,
    physicalDir,
    destBody,
    launchDateMs,
    elapsedSeconds * 0.985,
  );
  const closing = distanceToTargetKm < previousDistanceKm;
  const preLaunch = simulationDateMs < launchDateMs;
  const status = preLaunch
    ? "pre-launch"
    : getDirectStatus(
        elapsedSeconds,
        adjustedProfile.burnDurationSeconds,
        progress,
        closing,
        distanceToTargetKm,
        closestApproachKm,
        aimDistanceKm,
        destBody,
      );

  return {
    elapsedSeconds,
    speedKmS: flight.speedKmS,
    distanceTraveledKm: flight.distanceTraveledKm,
    distanceFromEarthKm: vectorLength(sub(rocketHelioKm, earthNowKm)),
    status,
    missionMode: "direct",
    launchMode,
    scenePosition,
    launchScenePosition: earthLaunchScene,
    sceneDirection: normalize(sub(destLaunchScene, earthLaunchScene)),
    destination: {
      bodyId: destBody.id,
      label: destination.label,
      distanceToTargetKm,
      etaSeconds: closing && flight.speedKmS > 0 ? distanceToTargetKm / flight.speedKmS : null,
      closestApproachKm,
      destScenePosition: computeBodyScenePosition(destBody, bodiesById, simDate, mode),
      destSceneRadius: getBodySceneRadius(destBody, mode),
    },
    transfer: null,
  };
};

export const formatMissionTime = (seconds: number): string => {
  if (seconds < 1) {
    return "0s";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3_600) {
    const minutes = Math.floor(seconds / 60);
    const remSeconds = Math.floor(seconds % 60);
    return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3_600);
    const remMinutes = Math.floor((seconds % 3_600) / 60);
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }
  if (seconds < 31_557_600) {
    const days = Math.floor(seconds / 86_400);
    const remHours = Math.floor((seconds % 86_400) / 3_600);
    return remHours ? `${days}d ${remHours}h` : `${days}d`;
  }
  const years = seconds / 31_557_600;
  return `${years.toFixed(years < 10 ? 2 : 1)} yr`;
};

const SPEED_OF_LIGHT_KM_S = 299_792.458;

export const formatSpeed = (speedKmS: number): string => {
  if (speedKmS >= 1_000) {
    const fractionC = speedKmS / SPEED_OF_LIGHT_KM_S;
    return `${Math.round(speedKmS).toLocaleString()} km/s · ${(fractionC * 100).toFixed(1)}% c`;
  }
  return `${speedKmS.toFixed(speedKmS >= 10 ? 1 : 2)} km/s`;
};

export const formatDeltaV = (deltaVKmS: number | null): string => {
  if (deltaVKmS === null) {
    return "--";
  }
  return `${deltaVKmS.toFixed(deltaVKmS >= 10 ? 1 : 2)} km/s`;
};

export const formatPhaseAngle = (degrees: number): string => `${degrees >= 0 ? "+" : ""}${degrees.toFixed(1)} deg`;
