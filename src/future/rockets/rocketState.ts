import { bodiesById } from "../../data";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodyPositionKm, vectorLength } from "../../simulation/solveOrbit";
import {
  computeBodyScenePosition,
  getBodySceneRadius,
  scaleDistanceFromSun,
  type ScaleMode,
} from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import { sampleFlight } from "./flightModel";
import type { RocketProfile } from "./rocketCatalog";

// Composition layer: turns a launched rocket + chosen destination + the current
// simulation time into a full, scale-independent view. It reads Earth and the
// destination's positions (never mutates them) and reuses the existing scene-scale
// utilities. Physical telemetry (km, km/s) is the source of truth; scene positions
// are derived rendering conveniences.
//
// This is a straight-line, FIXED-AIM educational model. A destination launch heads
// toward where the destination was AT LAUNCH (the aim direction does not chase the
// moving body). Distance-to-destination is still measured against the destination's
// CURRENT position, so the rocket can "miss" a body it aimed behind — which is the
// whole point of showing closest approach. It is NOT a transfer-orbit simulation.

const EARTH_ID = "earth";

// Within this distance from Earth the mission reads as "Departing".
const DEPART_FROM_EARTH_KM = 1_000_000;
// Fraction of the aim distance still counted as the departure phase (destination mode).
const DEPART_PROGRESS = 0.06;
// Inside this fraction of the aim distance the mission reads as "Approaching".
const APPROACH_FRACTION = 0.25;
// Samples used to estimate closest approach so far (destination mode).
const CLOSEST_APPROACH_SAMPLES = 40;

export type MissionStatus = "pre-launch" | "departing" | "cruising" | "approaching" | "passed";

export const missionStatusLabel: Record<MissionStatus, string> = {
  "pre-launch": "Pre-launch",
  departing: "Departing",
  cruising: "Cruising",
  approaching: "Approaching",
  passed: "Passed target",
};

export type RocketDestinationView = {
  bodyId: string;
  label: string;
  distanceToTargetKm: number;
  etaSeconds: number | null;
  closestApproachKm: number;
  /** Current scene position of the destination body (for the highlight + line). */
  destScenePosition: Vec3;
  destSceneRadius: number;
};

export type RocketView = {
  elapsedSeconds: number;
  speedKmS: number;
  distanceTraveledKm: number;
  distanceFromEarthKm: number;
  status: MissionStatus;
  /** Scene-space position of the rocket. */
  scenePosition: Vec3;
  /** Scene-space position the rocket launched from (Earth at launch). */
  launchScenePosition: Vec3;
  /** Fixed unit vector the rocket nose points along, in scene space. */
  sceneDirection: Vec3;
  /** Destination telemetry, or null for free flight. */
  destination: RocketDestinationView | null;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const normalize = (v: Vec3): Vec3 => {
  const length = vectorLength(v);
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
};

/** Straight-line distance from the rocket to the (moving) destination at mission time `tau`. */
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

/**
 * Estimate the closest approach to the (moving) destination so far by sampling the
 * trajectory from launch to now. Both the rocket and the destination move, so there
 * is no closed form; a coarse sample is good enough for the educational readout.
 * The current instant is always included, so `closestKm <= current distance`.
 */
const closestApproachSoFar = (
  profile: RocketProfile,
  launchOriginKm: Vec3,
  physicalDir: Vec3,
  destBody: CelestialBody,
  launchDateMs: number,
  elapsedSeconds: number,
  currentDistanceKm: number,
): number => {
  let closestKm = currentDistanceKm;
  for (let index = 0; index < CLOSEST_APPROACH_SAMPLES; index += 1) {
    const tau = (elapsedSeconds * index) / CLOSEST_APPROACH_SAMPLES;
    const distance = distanceToDestAt(profile, launchOriginKm, physicalDir, destBody, launchDateMs, tau);
    if (distance < closestKm) {
      closestKm = distance;
    }
  }
  return closestKm;
};

export const computeRocketView = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  destination: RocketDestination | null,
): RocketView => {
  const elapsedSeconds = Math.max(0, (simulationDateMs - launchDateMs) / 1_000);
  const flight = sampleFlight(profile, elapsedSeconds);
  const launchDate = new Date(launchDateMs);
  const simDate = new Date(simulationDateMs);

  const earth = bodiesById.get(EARTH_ID);
  const earthLaunchKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, launchDate) : [0, 0, 0];
  const earthNowKm: Vec3 = earth ? getBodyPositionKm(earth, bodiesById, simDate) : [0, 0, 0];
  const earthLaunchScene: Vec3 = earth
    ? computeBodyScenePosition(earth, bodiesById, launchDate, mode)
    : [0, 0, 0];

  const destBody = destination?.bodyId ? bodiesById.get(destination.bodyId) : undefined;

  let physicalDir: Vec3;
  let sceneDirection: Vec3;
  let scenePosition: Vec3;
  let aimDistanceKm = 0;

  if (destBody && destination) {
    const destLaunchKm = getBodyPositionKm(destBody, bodiesById, launchDate);
    const toTarget = sub(destLaunchKm, earthLaunchKm);
    aimDistanceKm = vectorLength(toTarget) || 1;
    physicalDir = normalize(toTarget);

    const destLaunchScene = computeBodyScenePosition(destBody, bodiesById, launchDate, mode);
    sceneDirection = normalize(sub(destLaunchScene, earthLaunchScene));
    const progress = flight.distanceTraveledKm / aimDistanceKm;
    scenePosition = lerp(earthLaunchScene, destLaunchScene, progress);
  } else {
    // Free flight: radially outward from the Sun, exactly as before.
    physicalDir = normalize(earthLaunchKm);
    sceneDirection = normalize(earthLaunchScene);
    const launchRadiusKm = vectorLength(earthLaunchKm);
    const rocketRadiusKm = launchRadiusKm + flight.distanceTraveledKm;
    scenePosition = mul(physicalDir, scaleDistanceFromSun(rocketRadiusKm, mode));
  }

  // Honest heliocentric rocket position for distance telemetry.
  const rocketHelioKm = add(earthLaunchKm, mul(physicalDir, flight.distanceTraveledKm));
  const distanceFromEarthKm = vectorLength(sub(rocketHelioKm, earthNowKm));

  let destinationView: RocketDestinationView | null = null;
  let status: MissionStatus;

  if (simulationDateMs < launchDateMs) {
    status = "pre-launch";
  } else if (destBody && destination) {
    const destNowKm = getBodyPositionKm(destBody, bodiesById, simDate);
    const distanceToTargetKm = vectorLength(sub(destNowKm, rocketHelioKm));
    const closestKm = closestApproachSoFar(
      profile,
      earthLaunchKm,
      physicalDir,
      destBody,
      launchDateMs,
      elapsedSeconds,
      distanceToTargetKm,
    );

    // Is the rocket currently closing on the target or falling behind it? Compare with
    // a slightly earlier instant. (The aim is fixed, so a body the rocket aimed behind
    // can recede from the start — a wide miss, not a flyby.)
    const previousDistanceKm = distanceToDestAt(
      profile,
      earthLaunchKm,
      physicalDir,
      destBody,
      launchDateMs,
      elapsedSeconds * 0.985,
    );
    const closing = distanceToTargetKm < previousDistanceKm;
    const madeCloseApproach = closestKm < APPROACH_FRACTION * aimDistanceKm;
    const progress = flight.distanceTraveledKm / aimDistanceKm;

    if (progress < DEPART_PROGRESS) {
      status = "departing";
    } else if (closing && distanceToTargetKm < APPROACH_FRACTION * aimDistanceKm) {
      status = "approaching";
    } else if (!closing && madeCloseApproach) {
      status = "passed";
    } else {
      // Still closing from afar, or coasting past a wide miss.
      status = "cruising";
    }

    const etaSeconds = closing && flight.speedKmS > 0 ? distanceToTargetKm / flight.speedKmS : null;

    destinationView = {
      bodyId: destination.bodyId!,
      label: destination.label,
      distanceToTargetKm,
      etaSeconds,
      closestApproachKm: closestKm,
      destScenePosition: computeBodyScenePosition(destBody, bodiesById, simDate, mode),
      destSceneRadius: getBodySceneRadius(destBody, mode),
    };
  } else {
    status = distanceFromEarthKm < DEPART_FROM_EARTH_KM ? "departing" : "cruising";
  }

  return {
    elapsedSeconds,
    speedKmS: flight.speedKmS,
    distanceTraveledKm: flight.distanceTraveledKm,
    distanceFromEarthKm,
    status,
    scenePosition,
    launchScenePosition: earthLaunchScene,
    sceneDirection,
    destination: destinationView,
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
