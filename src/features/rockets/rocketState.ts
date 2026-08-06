import { bodiesById } from "../../data";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";
import {
  addVec3 as add,
  clamp01,
  lerpVec3 as lerp,
  mulVec3 as mul,
  normalizeVec3 as normalize,
  subVec3 as sub,
} from "../../simulation/vec3";
import {
  computeBodyScenePosition,
  getBodySceneRadius,
  scaleDistanceFromSun,
  scaleVectorFromSun,
  type ScaleMode,
} from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import {
  clearDirectFlightCaches,
  distanceToDestAt,
  getDirectAimPlan,
  getPlannedDirectClosestApproach,
  sampleDirectFlight,
} from "./directFlightPlanning";
import {
  defaultArrivalMode,
  defaultLaunchMode,
  type RocketArrivalMode,
  type RocketLaunchMode,
  type RocketMissionMode,
} from "./missionOptions";
import type { RocketProfile } from "./rocketCatalog";
import type { MissionStatus, RocketView } from "./rocketPresentation";
import {
  clearTransferCaches,
  getPlannedTransferClosestApproach,
  getPostTransferContinuation,
  getTransferPlan,
  getTransferSceneArc,
} from "./transferPlanning";
import { interpolateTransferArcKm } from "./transferModel";

export {
  formatDeltaV,
  formatMissionTime,
  formatPhaseAngle,
  formatSpeed,
  missionStatusLabel,
} from "./rocketPresentation";
export type {
  MissionStatus,
  RocketDestinationView,
  RocketTransferView,
  RocketView,
} from "./rocketPresentation";

// Composition layer: turns a launched rocket, mission mode, destination, launch
// assumption, and current simulation time into a scale-independent scene/telemetry
// view. It never mutates celestial body data.
//
// Guided direct is an explicitly steered demonstration. Hohmann and Lambert modes use
// propagated two-body trajectories: Hohmann can miss when the phase is poor, while
// Lambert solves the endpoint and reports the required velocity independently of
// the illustrative rocket catalog.

const EARTH_ID = "earth";

const DIRECT_APPROACH_FRACTION = 0.25;
const DIRECT_SCENE_PATH_SAMPLES = 36;
const DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS = 1;
const ARRIVAL_PROGRESS_THRESHOLD = 0.999_999;
const ARRIVAL_BODY_EXTENT_MULTIPLIER = 1.12;
const ARRIVAL_BODY_LABEL_LANE_MULTIPLIER = 1.45;
const ARRIVAL_ROCKET_ENVELOPE = 0.26;
const ARRIVAL_PARKING_GAP = 0.08;
const ARRIVAL_RING_EXTENT_BY_BODY_ID: Partial<Record<string, number>> = {
  saturn: 2.72,
  uranus: 2.1,
};
const ARRIVAL_PARKING_SCENE_DIRECTION: Vec3 = [1, 0, 0];

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
  aimDistanceKm: number,
  canIntercept: boolean,
  interceptSeconds: number,
): MissionStatus => {
  const atOrPastIntercept =
    canIntercept &&
    (progress >= ARRIVAL_PROGRESS_THRESHOLD ||
      elapsedSeconds + DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS >= interceptSeconds);

  if (atOrPastIntercept) {
    return "arrived";
  }
  if (closing && distanceToTargetKm < DIRECT_APPROACH_FRACTION * aimDistanceKm) {
    return "approach";
  }
  if (elapsedSeconds < burnDurationSeconds) {
    return "burn";
  }
  return "coast";
};

const makeDestinationFollowScenePoints = (
  destBody: CelestialBody,
  startDateMs: number,
  endDateMs: number,
  mode: ScaleMode,
): Vec3[] => {
  if (endDateMs <= startDateMs) {
    return [];
  }

  return [getDestinationParkingScenePosition(destBody, new Date(endDateMs), mode)];
};

// Successful missions remain physically attached to their destination for telemetry,
// while the scene marker sits in a stable, readable parking position above the body.
// Keeping this visual-only avoids hiding the rocket mesh inside enlarged planet spheres.
const getDestinationParkingScenePosition = (
  destinationBody: CelestialBody,
  date: Date,
  mode: ScaleMode,
): Vec3 => {
  const destinationScenePosition = computeBodyScenePosition(
    destinationBody,
    bodiesById,
    date,
    mode,
  );
  const destinationSceneRadius = getBodySceneRadius(destinationBody, mode);
  const markerScale = mode === "real" || mode === "readable" ? 2.4 : 1;
  const bodyExtentMultiplier =
    ARRIVAL_RING_EXTENT_BY_BODY_ID[destinationBody.id] ?? ARRIVAL_BODY_EXTENT_MULTIPLIER;
  const parkingDistance =
    destinationSceneRadius * bodyExtentMultiplier * ARRIVAL_BODY_LABEL_LANE_MULTIPLIER +
    (ARRIVAL_ROCKET_ENVELOPE + ARRIVAL_PARKING_GAP) * markerScale;
  return add(destinationScenePosition, [0, parkingDistance, 0]);
};

const getDirectScenePosition = (
  rocketHelioKm: Vec3,
  progress: number,
  launchScene: Vec3,
  interceptScene: Vec3,
  destinationBody: CelestialBody,
  mode: ScaleMode,
): Vec3 => {
  if (destinationBody.type === "moon") {
    return lerp(launchScene, interceptScene, progress);
  }

  return scaleVectorFromSun(rocketHelioKm, mode);
};

const makeDirectScenePoints = (
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  pathDistanceKm: number,
  launchScene: Vec3,
  pathEndScene: Vec3,
  destinationBody: CelestialBody,
  mode: ScaleMode,
): Vec3[] => {
  if (destinationBody.type === "moon") {
    return [launchScene, pathEndScene];
  }

  return Array.from({ length: DIRECT_SCENE_PATH_SAMPLES + 1 }, (_value, index) => {
    const distanceKm = (pathDistanceKm * index) / DIRECT_SCENE_PATH_SAMPLES;
    return scaleVectorFromSun(add(launchOriginKm, mul(physicalDir, distanceKm)), mode);
  });
};

const buildFreeFlightView = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  launchMode: RocketLaunchMode,
  earthLaunchKm: Vec3,
  earthNowKm: Vec3,
  earthLaunchScene: Vec3,
): RocketView => {
  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const flight = sampleDirectFlight(profile, elapsedSeconds, launchMode);
  const physicalDir = normalize(earthLaunchKm);
  const launchRadiusKm = vectorLength(earthLaunchKm);
  const rocketRadiusKm = launchRadiusKm + flight.distanceTraveledKm;
  const scenePosition = mul(physicalDir, scaleDistanceFromSun(rocketRadiusKm, mode));
  const rocketHelioKm = add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const preLaunch = simulationDateMs < launchDateMs;
  const distanceFromEarthKm = preLaunch ? 0 : vectorLength(sub(rocketHelioKm, earthNowKm));

  return {
    elapsedSeconds,
    speedKmS: flight.speedKmS,
    distanceTraveledKm: flight.distanceTraveledKm,
    distanceFromEarthKm,
    status:
      preLaunch
        ? "pre-launch"
        : elapsedSeconds < profile.directCurve.burnDurationSeconds
          ? "burn"
          : "coast",
    missionMode: "direct",
    launchMode,
    arrivalMode: defaultArrivalMode,
    scenePosition,
    launchScenePosition: earthLaunchScene,
    sceneDirection: normalize(earthLaunchScene),
    directScenePoints: [earthLaunchScene, scenePosition],
    destination: null,
    transfer: null,
  };
};

// These module-level plan/arc/closest-approach caches persist for the JS module's
// lifetime. Clear them when a mission is reset so retired missions don't linger as
// hidden global state. Called from rocketStore.clear().
export const clearRocketCaches = () => {
  clearDirectFlightCaches();
  clearTransferCaches();
};

export const computeRocketView = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  destination: RocketDestination | null,
  missionMode: RocketMissionMode = "direct",
  launchMode: RocketLaunchMode = defaultLaunchMode,
  arrivalMode: RocketArrivalMode = defaultArrivalMode,
): RocketView => {
  const launchDate = new Date(launchDateMs);
  const simDate = new Date(simulationDateMs);
  const earth = bodiesById.get(EARTH_ID);
  const earthLaunchKm: Vec3 = earth
    ? getBodyPositionKm(earth, bodiesById, launchDate)
    : [0, 0, 0];
  const earthNowKm: Vec3 = earth
    ? getBodyPositionKm(earth, bodiesById, simDate)
    : [0, 0, 0];
  const earthLaunchScene: Vec3 = earth
    ? computeBodyScenePosition(earth, bodiesById, launchDate, mode)
    : [0, 0, 0];
  const destBody = destination?.bodyId ? bodiesById.get(destination.bodyId) : undefined;

  if (!destBody || !destination) {
    return buildFreeFlightView(
      profile,
      launchDateMs,
      simulationDateMs,
      mode,
      launchMode,
      earthLaunchKm,
      earthNowKm,
      earthLaunchScene,
    );
  }

  if (missionMode !== "direct") {
    const effectiveTransferMode = destBody.type === "moon" ? "hohmann" : missionMode;
    const plan = getTransferPlan(profile, destBody, launchDateMs, effectiveTransferMode);
    if (plan) {
      const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
      const transferTimeSeconds = Math.max(plan.estimate.transferTimeSeconds, 1);
      const progress = clamp01(elapsedSeconds / transferTimeSeconds);
      const arrivalDate = new Date(plan.estimate.arrivalDateMs);
      const transferComplete =
        progress >= ARRIVAL_PROGRESS_THRESHOLD ||
        elapsedSeconds + DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS >= transferTimeSeconds;
      const interceptToleranceKm = Math.max(destBody.physical.radiusKm * 1.05, 10);
      const interceptPredicted =
        plan.estimate.interceptGuaranteed ||
        plan.estimate.arrivalMissDistanceKm <= interceptToleranceKm;
      const intercepted = transferComplete && interceptPredicted;
      const captureAvailable =
        interceptPredicted && plan.estimate.captureDeltaVKmS !== null;
      const captured = transferComplete && arrivalMode === "capture" && captureAvailable;
      const targetArrivalScenePosition = computeBodyScenePosition(
        destBody,
        bodiesById,
        arrivalDate,
        mode,
      );
      const destinationScenePosition = computeBodyScenePosition(
        destBody,
        bodiesById,
        simDate,
        mode,
      );
      const transferScenePoints = getTransferSceneArc(plan, destBody, launchDateMs, mode);
      const postContinuation =
        transferComplete && !captured
          ? getPostTransferContinuation(plan, destBody, simulationDateMs, mode)
          : null;
      const arcScenePoints = transferScenePoints;
      const interceptScenePosition =
        transferScenePoints[transferScenePoints.length - 1] ?? targetArrivalScenePosition;
      const scenePosition = captured
        ? getDestinationParkingScenePosition(destBody, simDate, mode)
        : postContinuation?.scenePosition ?? interpolatePoints(transferScenePoints, progress);
      const sceneDirection = captured
        ? ARRIVAL_PARKING_SCENE_DIRECTION
        : postContinuation?.sceneDirection ?? directionAlongPoints(arcScenePoints, progress);
      const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
      const rocketHelioKm = captured
        ? destNowKm
        : postContinuation?.positionKm ?? interpolateTransferArcKm(plan.arc, progress);
      const distanceToTargetKm = captured ? 0 : vectorLength(sub(destNowKm, rocketHelioKm));
      const plannedClosestApproachKm = getPlannedTransferClosestApproach(
        plan.arc,
        plan.estimate,
        destBody,
        launchDateMs,
      );
      const closestApproachKm = captured
        ? 0
        : Math.min(plannedClosestApproachKm, distanceToTargetKm);
      const remainingSeconds = (plan.estimate.arrivalDateMs - simulationDateMs) / 1_000;
      const preLaunch = simulationDateMs < launchDateMs;
      const averageSpeedKmS = plan.estimate.meanTransferSpeedKmS;
      // This is the displayed parking-orbit injection event, not a claim that the
      // selected rocket's illustrative 1-D burn profile powers the heliocentric coast.
      const burnEndSeconds = 600;
      let status: MissionStatus;
      if (preLaunch) {
        status = "pre-launch";
      } else if (elapsedSeconds < burnEndSeconds) {
        status = "burn";
      } else if (progress < 0.82) {
        status = "transfer";
      } else if (!transferComplete) {
        status = "approach";
      } else if (!intercepted) {
        status = "missed";
      } else if (!captured) {
        status = "flyby";
      } else {
        status = "arrived";
      }

      return {
        elapsedSeconds,
        speedKmS: postContinuation
          ? vectorLength(postContinuation.velocityKmS)
          : averageSpeedKmS,
        distanceTraveledKm: plan.arc.arcLengthKm * progress,
        distanceFromEarthKm: preLaunch ? 0 : vectorLength(sub(rocketHelioKm, earthNowKm)),
        status,
        missionMode: effectiveTransferMode,
        launchMode,
        arrivalMode,
        scenePosition,
        launchScenePosition: earthLaunchScene,
        sceneDirection,
        directScenePoints: null,
        destination: {
          bodyId: destBody.id,
          label: destination.label,
          distanceToTargetKm,
          etaSeconds: remainingSeconds > 0 ? remainingSeconds : null,
          closestApproachKm,
          destScenePosition: destinationScenePosition,
          destSceneRadius: getBodySceneRadius(destBody, mode),
        },
        transfer: {
          estimate: plan.estimate,
          arcScenePoints,
          progress,
          arcLengthKm: plan.arc.arcLengthKm,
          interceptScenePosition,
          targetArrivalScenePosition,
          continuationScenePoints: postContinuation?.trailScenePoints ?? [],
          captureAvailable,
          captureApplied: captured,
        },
      };
    }
  }

  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const flight = sampleDirectFlight(profile, elapsedSeconds, launchMode);
  const directPlan = getDirectAimPlan(
    profile,
    earthLaunchKm,
    destBody,
    launchDateMs,
    launchMode,
  );
  const { aimDistanceKm, physicalDir } = directPlan;
  const interceptDate = new Date(launchDateMs + directPlan.interceptSeconds * 1_000);
  const destInterceptScene = computeBodyScenePosition(
    destBody,
    bodiesById,
    interceptDate,
    mode,
  );
  const progress = flight.distanceTraveledKm / aimDistanceKm;
  const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
  const arrived =
    directPlan.canIntercept &&
    (progress >= ARRIVAL_PROGRESS_THRESHOLD ||
      elapsedSeconds + DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS >= directPlan.interceptSeconds);
  const rocketHelioKm = arrived
    ? destNowKm
    : add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const scenePosition = arrived
    ? getDestinationParkingScenePosition(destBody, simDate, mode)
    : getDirectScenePosition(
        rocketHelioKm,
        progress,
        earthLaunchScene,
        destInterceptScene,
        destBody,
        mode,
      );
  const destinationScenePosition = computeBodyScenePosition(destBody, bodiesById, simDate, mode);
  const pathDistanceKm = directPlan.canIntercept
    ? Math.min(flight.distanceTraveledKm, aimDistanceKm)
    : flight.distanceTraveledKm;
  const pathEndKm = add(earthLaunchKm, mul(physicalDir, pathDistanceKm));
  const pathEndScene = getDirectScenePosition(
    pathEndKm,
    directPlan.canIntercept ? Math.min(progress, 1) : progress,
    earthLaunchScene,
    destInterceptScene,
    destBody,
    mode,
  );
  const directScenePoints = [
    ...makeDirectScenePoints(
      earthLaunchKm,
      physicalDir,
      pathDistanceKm,
      earthLaunchScene,
      pathEndScene,
      destBody,
      mode,
    ),
    ...(arrived
      ? makeDestinationFollowScenePoints(
          destBody,
          interceptDate.getTime(),
          simulationDateMs,
          mode,
        )
      : []),
  ];
  const distanceToTargetKm = arrived ? 0 : vectorLength(sub(destNowKm, rocketHelioKm));
  const plannedClosestApproachKm = getPlannedDirectClosestApproach(
    profile,
    earthLaunchKm,
    physicalDir,
    destBody,
    launchDateMs,
    directPlan,
    launchMode,
  );
  const closestApproachKm = arrived
    ? 0
    : Math.min(plannedClosestApproachKm, distanceToTargetKm);
  const previousDistanceKm = distanceToDestAt(
    profile,
    earthLaunchKm,
    physicalDir,
    destBody,
    launchDateMs,
    elapsedSeconds * 0.985,
    launchMode,
  );
  const closing = distanceToTargetKm < previousDistanceKm;
  const preLaunch = simulationDateMs < launchDateMs;
  const status = preLaunch
    ? "pre-launch"
    : getDirectStatus(
        elapsedSeconds,
        profile.directCurve.burnDurationSeconds,
        progress,
        closing,
        distanceToTargetKm,
        aimDistanceKm,
        directPlan.canIntercept,
        directPlan.interceptSeconds,
      );

  return {
    elapsedSeconds,
    speedKmS: arrived ? 0 : flight.speedKmS,
    distanceTraveledKm: pathDistanceKm,
    distanceFromEarthKm: preLaunch ? 0 : vectorLength(sub(rocketHelioKm, earthNowKm)),
    status,
    missionMode: "direct",
    launchMode,
    arrivalMode: defaultArrivalMode,
    scenePosition,
    launchScenePosition: earthLaunchScene,
    sceneDirection: arrived
      ? ARRIVAL_PARKING_SCENE_DIRECTION
      : normalize(sub(destInterceptScene, earthLaunchScene)),
    directScenePoints,
    destination: {
      bodyId: destBody.id,
      label: destination.label,
      distanceToTargetKm,
      etaSeconds:
        directPlan.canIntercept && elapsedSeconds < directPlan.interceptSeconds
          ? directPlan.interceptSeconds - elapsedSeconds
          : null,
      closestApproachKm,
      destScenePosition: destinationScenePosition,
      destSceneRadius: getBodySceneRadius(destBody, mode),
    },
    transfer: null,
  };
};
