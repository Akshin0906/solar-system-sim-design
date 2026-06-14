import * as THREE from "three";

export const CAMERA_FOV_DEG = 48;

export type Bounds = {
  center: THREE.Vector3;
  radius: number;
};

export const fitDistanceForRadius = (radius: number, fovDeg = CAMERA_FOV_DEG, safety = 1.55) => {
  const halfFovRad = THREE.MathUtils.degToRad(fovDeg / 2);
  return Math.max(0.01, (Math.max(radius, 0.01) / Math.tan(halfFovRad)) * safety);
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
