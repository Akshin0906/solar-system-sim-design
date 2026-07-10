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
  scaleMoonOffset,
  scaleVectorFromSun,
  type ScaleMode,
} from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import { sampleFlight } from "./flightModel";
import {
  defaultArrivalMode,
  defaultLaunchMode,
  type RocketArrivalMode,
  type RocketLaunchMode,
  type RocketMissionMode,
} from "./missionOptions";
import type { RocketProfile } from "./rocketCatalog";
import {
  estimateVelocityKmS,
  propagateTwoBody,
  sampleTwoBodyTrajectory,
} from "./orbitalTransfer";
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
// Guided direct is an explicitly steered demonstration. Hohmann and Lambert modes use
// propagated two-body trajectories: Hohmann can miss when the phase is poor, while
// Lambert solves the endpoint and reports the required velocity independently of
// the illustrative rocket catalog.

const EARTH_ID = "earth";

const DIRECT_APPROACH_FRACTION = 0.25;
const CLOSEST_APPROACH_SAMPLES = 40;
const TRANSFER_CACHE_LIMIT = 16;
const DIRECT_CACHE_LIMIT = 16;
const DIRECT_INTERCEPT_MAX_SECONDS = 31_557_600 * 120;
const DIRECT_INTERCEPT_SEARCH_ITERATIONS = 56;
const DIRECT_SCENE_PATH_SAMPLES = 36;
const DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS = 1;
const ARRIVAL_PROGRESS_THRESHOLD = 0.999_999;
const POST_ENCOUNTER_TRAIL_SAMPLES = 18;

export type MissionStatus =
  | "pre-launch"
  | "burn"
  | "coast"
  | "transfer"
  | "approach"
  | "arrived"
  | "flyby"
  | "missed";

export const missionStatusLabel: Record<MissionStatus, string> = {
  "pre-launch": "Pre-launch",
  burn: "Burn",
  coast: "Coast",
  transfer: "Transfer",
  approach: "Approach",
  arrived: "Arrived",
  flyby: "Flyby complete",
  missed: "Missed target",
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
  continuationScenePoints: Vec3[];
  captureAvailable: boolean;
  captureApplied: boolean;
};

export type RocketView = {
  elapsedSeconds: number;
  speedKmS: number;
  distanceTraveledKm: number;
  distanceFromEarthKm: number;
  status: MissionStatus;
  missionMode: RocketMissionMode;
  launchMode: RocketLaunchMode;
  arrivalMode: RocketArrivalMode;
  scenePosition: Vec3;
  launchScenePosition: Vec3;
  sceneDirection: Vec3;
  directScenePoints: Vec3[] | null;
  destination: RocketDestinationView | null;
  transfer: RocketTransferView | null;
};

type CachedTransferPlan = {
  estimate: TransferEstimate;
  arc: TransferArc;
};

type DirectAimPlan = {
  canIntercept: boolean;
  interceptSeconds: number;
  physicalDir: Vec3;
  aimDistanceKm: number;
};

const setBoundedCacheEntry = <T>(cache: Map<string, T>, key: string, value: T, limit: number) => {
  if (cache.size >= limit && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  cache.set(key, value);
};

const sampleDirectFlight = (
  profile: RocketProfile,
  elapsedSeconds: number,
  _launchMode: RocketLaunchMode,
) => sampleFlight(profile, elapsedSeconds);

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

/** Straight-line distance from the rocket to the moving destination at mission time tau. */
const distanceToDestAt = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  tau: number,
  launchMode: RocketLaunchMode,
): number => {
  const traveled = sampleDirectFlight(profile, tau, launchMode).distanceTraveledKm;
  const rocketKm = add(launchOriginKm, mul(physicalDir, traveled));
  const destKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + tau * 1_000));
  return vectorLength(sub(rocketKm, destKm));
};

const directPlanCache = new Map<string, DirectAimPlan>();
const directClosestApproachCache = new Map<string, number>();

const buildLaunchTimeDirectPlan = (
  launchOriginKm: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
): DirectAimPlan => {
  const interceptPointKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs));
  const toTarget = sub(interceptPointKm, launchOriginKm);
  const aimDistanceKm = vectorLength(toTarget) || 1;
  return {
    canIntercept: false,
    interceptSeconds: 0,
    physicalDir: normalize(toTarget),
    aimDistanceKm,
  };
};

const getDirectAimPlan = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  launchMode: RocketLaunchMode,
): DirectAimPlan => {
  const key = `${profile.id}|${destBody.id}|${launchDateMs}|${launchMode}`;
  const cached = directPlanCache.get(key);
  if (cached) {
    return cached;
  }

  let lowerSeconds = 0;
  let upperSeconds = 3_600;
  const distanceGapAt = (tau: number) => {
    const targetKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + tau * 1_000));
    return sampleDirectFlight(profile, tau, launchMode).distanceTraveledKm - vectorLength(sub(targetKm, launchOriginKm));
  };

  while (upperSeconds < DIRECT_INTERCEPT_MAX_SECONDS && distanceGapAt(upperSeconds) < 0) {
    lowerSeconds = upperSeconds;
    upperSeconds *= 2;
  }

  let plan = buildLaunchTimeDirectPlan(launchOriginKm, destBody, launchDateMs);
  if (upperSeconds < DIRECT_INTERCEPT_MAX_SECONDS) {
    for (let index = 0; index < DIRECT_INTERCEPT_SEARCH_ITERATIONS; index += 1) {
      const mid = (lowerSeconds + upperSeconds) / 2;
      if (distanceGapAt(mid) >= 0) {
        upperSeconds = mid;
      } else {
        lowerSeconds = mid;
      }
    }

    const interceptSeconds = upperSeconds;
    const interceptPointKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + interceptSeconds * 1_000));
    const toIntercept = sub(interceptPointKm, launchOriginKm);
    const aimDistanceKm = vectorLength(toIntercept) || 1;
    plan = {
      canIntercept: true,
      interceptSeconds,
      physicalDir: normalize(toIntercept),
      aimDistanceKm,
    };
  }

  setBoundedCacheEntry(directPlanCache, key, plan, DIRECT_CACHE_LIMIT);
  return plan;
};

const getPlannedDirectClosestApproach = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  directPlan: DirectAimPlan,
  launchMode: RocketLaunchMode,
): number => {
  const key = `${profile.id}|${destBody.id}|${launchDateMs}|${launchMode}`;
  const cached = directClosestApproachCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const endSeconds = directPlan.canIntercept ? directPlan.interceptSeconds : DIRECT_INTERCEPT_MAX_SECONDS;
  let closestKm = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (endSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const distance = distanceToDestAt(profile, launchOriginKm, physicalDir, destBody, launchDateMs, tau, launchMode);
    if (distance < closestKm) {
      closestKm = distance;
    }
  }

  setBoundedCacheEntry(directClosestApproachCache, key, closestKm, DIRECT_CACHE_LIMIT);
  return closestKm;
};

const transferPlanCache = new Map<string, CachedTransferPlan>();
const transferSceneArcCache = new Map<string, Vec3[]>();
const transferClosestApproachCache = new Map<string, number>();

// These module-level plan/arc/closest-approach caches persist for the JS module's
// lifetime. Clear them when a mission is reset so retired missions don't linger as
// hidden global state. Called from rocketStore.clear().
export const clearRocketCaches = () => {
  directPlanCache.clear();
  directClosestApproachCache.clear();
  transferPlanCache.clear();
  transferSceneArcCache.clear();
  transferClosestApproachCache.clear();
};

const getTransferPlan = (
  profile: RocketProfile,
  destBody: CelestialBody,
  launchDateMs: number,
  trajectoryModel: "hohmann" | "lambert",
): CachedTransferPlan | null => {
  const key = `${profile.id}|${destBody.id}|${launchDateMs}|${trajectoryModel}`;
  const cached = transferPlanCache.get(key);
  if (cached) {
    return cached;
  }

  const estimate = estimateTransfer(destBody, bodiesById, launchDateMs, profile, trajectoryModel);
  if (!estimate) {
    return null;
  }
  const arc = sampleTransferArcKm(estimate, bodiesById, launchDateMs);
  if (!arc) {
    return null;
  }

  const plan = { estimate, arc };
  setBoundedCacheEntry(transferPlanCache, key, plan, TRANSFER_CACHE_LIMIT);
  return plan;
};

const getPlannedTransferClosestApproach = (
  arc: TransferArc,
  estimate: TransferEstimate,
  destBody: CelestialBody,
  launchDateMs: number,
): number => {
  const key = `${destBody.id}|${launchDateMs}|${estimate.arrivalDateMs}`;
  const cached = transferClosestApproachCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let closestKm = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (estimate.transferTimeSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const progress = estimate.transferTimeSeconds > 0 ? tau / estimate.transferTimeSeconds : 0;
    const rocketKm = interpolateTransferArcKm(arc, progress);
    const destKm = getBodyPositionKm(destBody, bodiesById, new Date(launchDateMs + tau * 1_000));
    const distance = vectorLength(sub(rocketKm, destKm));
    if (distance < closestKm) {
      closestKm = distance;
    }
  }
  setBoundedCacheEntry(transferClosestApproachCache, key, closestKm, TRANSFER_CACHE_LIMIT);
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
  destinationBody: CelestialBody,
  launchDateMs: number,
  mode: ScaleMode,
): Vec3[] => {
  const cacheKey = `${destinationBody.id}|${launchDateMs}|${plan.estimate.arrivalDateMs}|${mode}`;
  const cached = transferSceneArcCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let points: Vec3[];
  if (plan.estimate.centralBodyId === "earth") {
    const earth = bodiesById.get(EARTH_ID);
    if (!earth) {
      points = makeLocalTransferSceneArc(
        scaleVectorFromSun(plan.arc.launchPointKm, mode),
        scaleVectorFromSun(plan.arc.interceptPointKm, mode),
        plan.arc.pointsKm.length - 1,
      );
      setBoundedCacheEntry(transferSceneArcCache, cacheKey, points, TRANSFER_CACHE_LIMIT);
      return points;
    }

    points = plan.arc.pointsKm.map((point, index) => {
      const progress = plan.arc.pointsKm.length > 1 ? index / (plan.arc.pointsKm.length - 1) : 0;
      const sampleDate = new Date(launchDateMs + plan.estimate.transferTimeSeconds * 1_000 * progress);
      const earthKm = getBodyPositionKm(earth, bodiesById, sampleDate);
      const earthScene = computeBodyScenePosition(earth, bodiesById, sampleDate, mode);
      return add(
        earthScene,
        scaleMoonOffset(sub(point, earthKm), mode, { parentBody: earth, moonBody: destinationBody }),
      );
    });
  } else {
    points = plan.arc.pointsKm.map((point) => scaleVectorFromSun(point, mode));
  }

  setBoundedCacheEntry(transferSceneArcCache, cacheKey, points, TRANSFER_CACHE_LIMIT);
  return points;
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

  return [computeBodyScenePosition(destBody, bodiesById, new Date(endDateMs), mode)];
};

type PostTransferContinuation = {
  positionKm: Vec3;
  velocityKmS: Vec3;
  scenePosition: Vec3;
  sceneDirection: Vec3;
  trailScenePoints: Vec3[];
};

// Continue an uncaptured conic beyond the planned encounter. Heliocentric
// transfers remain Sun-centered; the Moon preview is propagated in an
// Earth-centered frame and then translated by Earth's dated ephemeris state.
const getPostTransferContinuation = (
  plan: CachedTransferPlan,
  destinationBody: CelestialBody,
  simulationDateMs: number,
  mode: ScaleMode,
): PostTransferContinuation | null => {
  const postSeconds = (simulationDateMs - plan.estimate.arrivalDateMs) / 1_000;
  if (postSeconds <= 0) {
    return null;
  }

  const trailSeconds = Math.min(
    postSeconds,
    Math.max(3_600, Math.min(plan.estimate.transferTimeSeconds * 0.12, 60 * 86_400)),
  );
  const trailStartSeconds = postSeconds - trailSeconds;
  let currentPositionKm: Vec3;
  let currentVelocityKmS: Vec3;
  let trailPositionsKm: Vec3[];

  if (plan.estimate.centralBodyId === "earth") {
    const earth = bodiesById.get(EARTH_ID);
    const earthMu = earth?.physical.gravitationalParameterKm3S2 ?? 0;
    if (!earth || earthMu <= 0) {
      return null;
    }
    const earthPositionAt = (date: Date) => getBodyPositionKm(earth, bodiesById, date);
    const arrivalDate = new Date(plan.estimate.arrivalDateMs);
    const earthArrivalPositionKm = earthPositionAt(arrivalDate);
    const earthArrivalVelocityKmS = estimateVelocityKmS(earthPositionAt, plan.estimate.arrivalDateMs);
    const localArrivalPositionKm = sub(plan.estimate.arrivalTrajectoryPositionKm, earthArrivalPositionKm);
    const localArrivalVelocityKmS = sub(plan.estimate.arrivalTrajectoryVelocityKmS, earthArrivalVelocityKmS);
    const localCurrent = propagateTwoBody(localArrivalPositionKm, localArrivalVelocityKmS, postSeconds, earthMu);
    const localTrailStart = propagateTwoBody(
      localArrivalPositionKm,
      localArrivalVelocityKmS,
      trailStartSeconds,
      earthMu,
    );
    if (!localCurrent || !localTrailStart) {
      return null;
    }
    const localTrail = sampleTwoBodyTrajectory(
      localTrailStart.positionKm,
      localTrailStart.velocityKmS,
      trailSeconds,
      earthMu,
      POST_ENCOUNTER_TRAIL_SAMPLES,
    );
    if (!localTrail) {
      return null;
    }
    const currentDate = new Date(simulationDateMs);
    const earthCurrentPositionKm = earthPositionAt(currentDate);
    const earthCurrentVelocityKmS = estimateVelocityKmS(earthPositionAt, simulationDateMs);
    currentPositionKm = add(earthCurrentPositionKm, localCurrent.positionKm);
    currentVelocityKmS = add(earthCurrentVelocityKmS, localCurrent.velocityKmS);
    trailPositionsKm = localTrail.map((localPositionKm, index) => {
      const fraction = localTrail.length > 1 ? index / (localTrail.length - 1) : 1;
      const sampleDate = new Date(
        plan.estimate.arrivalDateMs + (trailStartSeconds + trailSeconds * fraction) * 1_000,
      );
      return add(earthPositionAt(sampleDate), localPositionKm);
    });
  } else {
    const sun = bodiesById.get("sun");
    const sunMu = sun?.physical.gravitationalParameterKm3S2 ?? 0;
    if (sunMu <= 0) {
      return null;
    }
    const current = propagateTwoBody(
      plan.estimate.arrivalTrajectoryPositionKm,
      plan.estimate.arrivalTrajectoryVelocityKmS,
      postSeconds,
      sunMu,
    );
    const trailStart = propagateTwoBody(
      plan.estimate.arrivalTrajectoryPositionKm,
      plan.estimate.arrivalTrajectoryVelocityKmS,
      trailStartSeconds,
      sunMu,
    );
    if (!current || !trailStart) {
      return null;
    }
    const trail = sampleTwoBodyTrajectory(
      trailStart.positionKm,
      trailStart.velocityKmS,
      trailSeconds,
      sunMu,
      POST_ENCOUNTER_TRAIL_SAMPLES,
    );
    if (!trail) {
      return null;
    }
    currentPositionKm = current.positionKm;
    currentVelocityKmS = current.velocityKmS;
    trailPositionsKm = trail;
  }

  const trailScenePoints =
    plan.estimate.centralBodyId === "earth"
      ? trailPositionsKm.map((positionKm, index) => {
          const earth = bodiesById.get(EARTH_ID)!;
          const fraction = trailPositionsKm.length > 1 ? index / (trailPositionsKm.length - 1) : 1;
          const sampleDate = new Date(
            simulationDateMs - trailSeconds * 1_000 + trailSeconds * 1_000 * fraction,
          );
          const earthPositionKm = getBodyPositionKm(earth, bodiesById, sampleDate);
          const earthScene = computeBodyScenePosition(earth, bodiesById, sampleDate, mode);
          return add(
            earthScene,
            scaleMoonOffset(sub(positionKm, earthPositionKm), mode, {
              parentBody: earth,
              moonBody: destinationBody,
            }),
          );
        })
      : trailPositionsKm.map((positionKm) => scaleVectorFromSun(positionKm, mode));
  const scenePosition = trailScenePoints[trailScenePoints.length - 1] ?? scaleVectorFromSun(currentPositionKm, mode);
  const previousScenePosition = trailScenePoints[trailScenePoints.length - 2] ?? scenePosition;

  return {
    positionKm: currentPositionKm,
    velocityKmS: currentVelocityKmS,
    scenePosition,
    sceneDirection: normalize(sub(scenePosition, previousScenePosition)),
    trailScenePoints,
  };
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
    status: preLaunch ? "pre-launch" : elapsedSeconds < profile.directCurve.burnDurationSeconds ? "burn" : "coast",
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
  const earthLaunchKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, launchDate) : [0, 0, 0];
  const earthNowKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, simDate) : [0, 0, 0];
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
        plan.estimate.interceptGuaranteed || plan.estimate.arrivalMissDistanceKm <= interceptToleranceKm;
      const intercepted = transferComplete && interceptPredicted;
      const captureAvailable = interceptPredicted && plan.estimate.captureDeltaVKmS !== null;
      const captured = transferComplete && arrivalMode === "capture" && captureAvailable;
      const targetArrivalScenePosition = computeBodyScenePosition(destBody, bodiesById, arrivalDate, mode);
      const transferScenePoints = getTransferSceneArc(plan, destBody, launchDateMs, mode);
      const postContinuation = transferComplete && !captured
        ? getPostTransferContinuation(plan, destBody, simulationDateMs, mode)
        : null;
      const arcScenePoints = transferScenePoints;
      const interceptScenePosition =
        transferScenePoints[transferScenePoints.length - 1] ?? targetArrivalScenePosition;
      const scenePosition = captured
        ? computeBodyScenePosition(destBody, bodiesById, simDate, mode)
        : postContinuation?.scenePosition ?? interpolatePoints(transferScenePoints, progress);
      const sceneDirection =
        postContinuation?.sceneDirection ?? directionAlongPoints(arcScenePoints, progress);
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
      const closestApproachKm = captured ? 0 : Math.min(plannedClosestApproachKm, distanceToTargetKm);
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
        speedKmS: postContinuation ? vectorLength(postContinuation.velocityKmS) : averageSpeedKmS,
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
          continuationScenePoints: postContinuation?.trailScenePoints ?? [],
          captureAvailable,
          captureApplied: captured,
        },
      };
    }
  }

  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const flight = sampleDirectFlight(profile, elapsedSeconds, launchMode);
  const directPlan = getDirectAimPlan(profile, earthLaunchKm, destBody, launchDateMs, launchMode);
  const { aimDistanceKm, physicalDir } = directPlan;
  const interceptDate = new Date(launchDateMs + directPlan.interceptSeconds * 1_000);
  const destInterceptScene = computeBodyScenePosition(destBody, bodiesById, interceptDate, mode);
  const progress = flight.distanceTraveledKm / aimDistanceKm;
  const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
  const arrived =
    directPlan.canIntercept &&
    (progress >= ARRIVAL_PROGRESS_THRESHOLD ||
      elapsedSeconds + DIRECT_ARRIVAL_TIME_TOLERANCE_SECONDS >= directPlan.interceptSeconds);
  const rocketHelioKm = arrived ? destNowKm : add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const scenePosition = arrived
    ? computeBodyScenePosition(destBody, bodiesById, simDate, mode)
    : getDirectScenePosition(rocketHelioKm, progress, earthLaunchScene, destInterceptScene, destBody, mode);
  const pathDistanceKm = directPlan.canIntercept ? Math.min(flight.distanceTraveledKm, aimDistanceKm) : flight.distanceTraveledKm;
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
    ...makeDirectScenePoints(earthLaunchKm, physicalDir, pathDistanceKm, earthLaunchScene, pathEndScene, destBody, mode),
    ...(arrived ? makeDestinationFollowScenePoints(destBody, interceptDate.getTime(), simulationDateMs, mode) : []),
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
  const closestApproachKm = arrived ? 0 : Math.min(plannedClosestApproachKm, distanceToTargetKm);
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
    sceneDirection: normalize(sub(destInterceptScene, earthLaunchScene)),
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

export const formatPhaseAngle = (degrees: number): string => `${degrees >= 0 ? "+" : ""}${degrees.toFixed(1)}°`;
