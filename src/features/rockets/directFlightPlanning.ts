import { bodiesById } from "../../data";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";
import {
  addVec3 as add,
  mulVec3 as mul,
  normalizeVec3 as normalize,
  subVec3 as sub,
} from "../../simulation/vec3";
import { sampleFlight } from "./flightModel";
import type { RocketLaunchMode } from "./missionOptions";
import type { RocketProfile } from "./rocketCatalog";

const CLOSEST_APPROACH_SAMPLES = 40;
const DIRECT_CACHE_LIMIT = 16;
const DIRECT_INTERCEPT_MAX_SECONDS = 31_557_600 * 120;
const DIRECT_INTERCEPT_SEARCH_ITERATIONS = 56;

export type DirectAimPlan = {
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

export const sampleDirectFlight = (
  profile: RocketProfile,
  elapsedSeconds: number,
  _launchMode: RocketLaunchMode,
) => sampleFlight(profile, elapsedSeconds);

/** Straight-line distance from the rocket to the moving destination at mission time tau. */
export const distanceToDestAt = (
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

export const getDirectAimPlan = (
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
    const targetKm = getBodyPositionKm(
      destBody,
      bodiesById,
      new Date(launchDateMs + tau * 1_000),
    );
    return (
      sampleDirectFlight(profile, tau, launchMode).distanceTraveledKm -
      vectorLength(sub(targetKm, launchOriginKm))
    );
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
    const interceptPointKm = getBodyPositionKm(
      destBody,
      bodiesById,
      new Date(launchDateMs + interceptSeconds * 1_000),
    );
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

export const getPlannedDirectClosestApproach = (
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

  const endSeconds = directPlan.canIntercept
    ? directPlan.interceptSeconds
    : DIRECT_INTERCEPT_MAX_SECONDS;
  let closestKm = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (endSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const distance = distanceToDestAt(
      profile,
      launchOriginKm,
      physicalDir,
      destBody,
      launchDateMs,
      tau,
      launchMode,
    );
    if (distance < closestKm) {
      closestKm = distance;
    }
  }

  setBoundedCacheEntry(directClosestApproachCache, key, closestKm, DIRECT_CACHE_LIMIT);
  return closestKm;
};

export const clearDirectFlightCaches = () => {
  directPlanCache.clear();
  directClosestApproachCache.clear();
};
