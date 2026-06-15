import type { Vec3 } from "./orbitalElements";

// Canonical small-vector + scalar math helpers. Shared across the simulation, scene,
// and rockets layers so the same trivial implementations don't get redefined (and
// silently drift) in multiple files.

export const vectorLength = ([x, y, z]: Vec3) => Math.sqrt(x * x + y * y + z * z);

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const subVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const mulVec3 = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];

export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const normalizeVec3 = (v: Vec3): Vec3 => {
  const length = vectorLength(v);
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
};

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const clamp01 = (value: number) => clamp(value, 0, 1);
