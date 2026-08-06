import { bodiesById } from "../../data";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";
import {
  addVec3 as add,
  lerpVec3 as lerp,
  normalizeVec3 as normalize,
  subVec3 as sub,
} from "../../simulation/vec3";
import {
  computeBodyScenePosition,
  scaleMoonOffset,
  scaleVectorFromSun,
  type ScaleMode,
} from "../../simulation/units";
import {
  estimateVelocityKmS,
  propagateTwoBody,
  sampleTwoBodyTrajectory,
} from "./orbitalTransfer";
import type { RocketProfile } from "./rocketCatalog";
import {
  estimateTransfer,
  interpolateTransferArcKm,
  sampleTransferArcKm,
  type TransferArc,
  type TransferEstimate,
} from "./transferModel";

const EARTH_ID = "earth";
const CLOSEST_APPROACH_SAMPLES = 40;
const TRANSFER_CACHE_LIMIT = 16;
const POST_ENCOUNTER_TRAIL_SAMPLES = 18;

export type CachedTransferPlan = {
  estimate: TransferEstimate;
  arc: TransferArc;
};

export type PostTransferContinuation = {
  positionKm: Vec3;
  velocityKmS: Vec3;
  scenePosition: Vec3;
  sceneDirection: Vec3;
  trailScenePoints: Vec3[];
};

const getTransferEstimateCacheSignature = (estimate: TransferEstimate) =>
  [
    estimate.trajectoryModel,
    estimate.centralBodyId,
    estimate.arrivalDateMs,
    estimate.transferTimeSeconds,
  ].join("|");

const setBoundedCacheEntry = <T>(cache: Map<string, T>, key: string, value: T, limit: number) => {
  if (cache.size >= limit && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  cache.set(key, value);
};

const transferPlanCache = new Map<string, CachedTransferPlan>();
const transferSceneArcCache = new Map<string, Vec3[]>();
const transferClosestApproachCache = new Map<string, number>();

export const getTransferPlan = (
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

export const getPlannedTransferClosestApproach = (
  arc: TransferArc,
  estimate: TransferEstimate,
  destBody: CelestialBody,
  launchDateMs: number,
): number => {
  const key = `${destBody.id}|${launchDateMs}|${getTransferEstimateCacheSignature(estimate)}`;
  const cached = transferClosestApproachCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let closestKm = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (estimate.transferTimeSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const progress = estimate.transferTimeSeconds > 0 ? tau / estimate.transferTimeSeconds : 0;
    const rocketKm = interpolateTransferArcKm(arc, progress);
    const destKm = getBodyPositionKm(
      destBody,
      bodiesById,
      new Date(launchDateMs + tau * 1_000),
    );
    const distance = vectorLength(sub(rocketKm, destKm));
    if (distance < closestKm) {
      closestKm = distance;
    }
  }
  setBoundedCacheEntry(
    transferClosestApproachCache,
    key,
    closestKm,
    TRANSFER_CACHE_LIMIT,
  );
  return closestKm;
};

const makeLocalTransferSceneArc = (
  launchScene: Vec3,
  arrivalScene: Vec3,
  samples: number,
): Vec3[] => {
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

export const getTransferSceneArc = (
  plan: CachedTransferPlan,
  destinationBody: CelestialBody,
  launchDateMs: number,
  mode: ScaleMode,
): Vec3[] => {
  const cacheKey = `${destinationBody.id}|${launchDateMs}|${getTransferEstimateCacheSignature(plan.estimate)}|${mode}`;
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
      const sampleDate = new Date(
        launchDateMs + plan.estimate.transferTimeSeconds * 1_000 * progress,
      );
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

// Continue an uncaptured conic beyond the planned encounter. Heliocentric
// transfers remain Sun-centered; the Moon preview is propagated in an
// Earth-centered frame and then translated by Earth's dated ephemeris state.
export const getPostTransferContinuation = (
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
    const earthArrivalVelocityKmS = estimateVelocityKmS(
      earthPositionAt,
      plan.estimate.arrivalDateMs,
    );
    const localArrivalPositionKm = sub(
      plan.estimate.arrivalTrajectoryPositionKm,
      earthArrivalPositionKm,
    );
    const localArrivalVelocityKmS = sub(
      plan.estimate.arrivalTrajectoryVelocityKmS,
      earthArrivalVelocityKmS,
    );
    const localCurrent = propagateTwoBody(
      localArrivalPositionKm,
      localArrivalVelocityKmS,
      postSeconds,
      earthMu,
    );
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
          const fraction =
            trailPositionsKm.length > 1 ? index / (trailPositionsKm.length - 1) : 1;
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
  const scenePosition =
    trailScenePoints[trailScenePoints.length - 1] ?? scaleVectorFromSun(currentPositionKm, mode);
  const previousScenePosition = trailScenePoints[trailScenePoints.length - 2] ?? scenePosition;

  return {
    positionKm: currentPositionKm,
    velocityKmS: currentVelocityKmS,
    scenePosition,
    sceneDirection: normalize(sub(scenePosition, previousScenePosition)),
    trailScenePoints,
  };
};

export const clearTransferCaches = () => {
  transferPlanCache.clear();
  transferSceneArcCache.clear();
  transferClosestApproachCache.clear();
};
