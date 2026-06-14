import * as THREE from "three";
import type { CelestialBody } from "../simulation/orbitalElements";

export const CAMERA_FOV_DEG = 48;
export const MIN_FIT_RADIUS = 0.00001;
export const MIN_SURFACE_DISTANCE = 0.0001;
export const SURFACE_DISTANCE_RADIUS_MULTIPLIER = 1.2;
export const PREFERRED_CAMERA_NEAR = 0.00001;
export const MIN_CAMERA_NEAR = 0.000001;
export const MAX_CAMERA_NEAR = 0.1;
export const FOCUS_FRAMING_SAFETY = 1.9;

export type Bounds = {
  center: THREE.Vector3;
  radius: number;
};

export const fitDistanceForRadius = (radius: number, fovDeg = CAMERA_FOV_DEG, safety = 1.55) => {
  const halfFovRad = THREE.MathUtils.degToRad(fovDeg / 2);
  return Math.max(MIN_FIT_RADIUS, (Math.max(radius, MIN_FIT_RADIUS) / Math.tan(halfFovRad)) * safety);
};

export const visualRadiusForBody = (body: CelestialBody, radius: number) => {
  const visibleRadius = Math.max(radius, MIN_FIT_RADIUS);

  if (body.id === "saturn") {
    return visibleRadius * 2.68;
  }

  if (body.id === "uranus") {
    return visibleRadius * 2.05;
  }

  if (body.type === "star") {
    return visibleRadius * 1.2;
  }

  return visibleRadius * 1.1;
};

export const surfaceMinDistanceForRadius = (radius: number) =>
  Math.max(radius * SURFACE_DISTANCE_RADIUS_MULTIPLIER, MIN_SURFACE_DISTANCE);

export const cameraNearForTarget = (distanceToTarget: number, targetRadius = 0) => {
  const distanceBasedNear = THREE.MathUtils.clamp(distanceToTarget * 0.02, PREFERRED_CAMERA_NEAR, MAX_CAMERA_NEAR);
  const surfaceClearance = distanceToTarget - targetRadius;

  if (surfaceClearance <= 0) {
    return MIN_CAMERA_NEAR;
  }

  return Math.max(Math.min(distanceBasedNear, surfaceClearance * 0.48), MIN_CAMERA_NEAR);
};

export const boundsForPoints = (points: THREE.Vector3[]): Bounds => {
  if (points.length === 0) {
    return { center: new THREE.Vector3(), radius: 1 };
  }

  const box = new THREE.Box3().setFromPoints(points);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  return { center, radius: Math.max(size.x, size.y, size.z) / 2 };
};

export const cameraOffset = (distance: number, mode: "overview" | "inner" | "outer" | "focus" | "moons") => {
  const directionByMode = {
    overview: new THREE.Vector3(0.22, 0.58, 1),
    inner: new THREE.Vector3(-0.28, 0.54, 1),
    outer: new THREE.Vector3(-0.52, 0.58, 1),
    focus: new THREE.Vector3(0.82, 0.46, 1),
    moons: new THREE.Vector3(0.68, 0.42, 1),
  };

  return directionByMode[mode].normalize().multiplyScalar(distance);
};
