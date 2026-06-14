import { AU_KM, EARTH_RADIUS_KM } from "../data/constants";
import type { CelestialBody, Vec3 } from "./orbitalElements";
import { addVec3, getOrbitPositionKm, vectorLength } from "./solveOrbit";

export type ScaleMode = "real" | "readable" | "compressed" | "overview";
export type LabelDensity = "minimal" | "standard" | "full";

export const SCALE_MODES: Array<{ id: ScaleMode; label: string; note: string }> = [
  { id: "real", label: "Real", note: "True distance and true radius" },
  { id: "readable", label: "Bodies", note: "True distance with readable bodies" },
  { id: "compressed", label: "Compressed", note: "Compressed distance and readable bodies" },
  { id: "overview", label: "Map", note: "System overview scale" },
];

const realUnitsPerAu = 7;

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const length = vectorLength([x, y, z]);
  if (length === 0) {
    return [0, 0, 0];
  }

  return [x / length, y / length, z / length];
};

const multiply = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];

export const scaleDistanceFromSun = (distanceKm: number, mode: ScaleMode) => {
  const distanceAu = distanceKm / AU_KM;

  if (mode === "real" || mode === "readable") {
    return distanceAu * realUnitsPerAu;
  }

  if (mode === "compressed") {
    return Math.pow(Math.max(distanceAu, 0.0001), 0.62) * 16;
  }

  return Math.log10(distanceAu + 1) * 52;
};

export const scaleVectorFromSun = (positionKm: Vec3, mode: ScaleMode): Vec3 => {
  const distanceKm = vectorLength(positionKm);
  if (distanceKm === 0) {
    return [0, 0, 0];
  }

  return multiply(normalize(positionKm), scaleDistanceFromSun(distanceKm, mode));
};

export const scaleMoonOffset = (offsetKm: Vec3, mode: ScaleMode): Vec3 => {
  const distanceKm = vectorLength(offsetKm);
  if (distanceKm === 0) {
    return [0, 0, 0];
  }

  if (mode === "real" || mode === "readable") {
    return multiply(normalize(offsetKm), (distanceKm / AU_KM) * realUnitsPerAu);
  }

  if (mode === "compressed") {
    return multiply(normalize(offsetKm), Math.pow(distanceKm / 100_000, 0.74) * 0.72);
  }

  return multiply(normalize(offsetKm), Math.pow(distanceKm / 100_000, 0.52) * 0.32);
};

export const getBodySceneRadius = (body: CelestialBody, mode: ScaleMode) => {
  const trueRadius = (body.physical.radiusKm / AU_KM) * realUnitsPerAu;

  if (mode === "real") {
    return trueRadius;
  }

  if (body.type === "star") {
    return mode === "readable" ? 1.35 : 2.15;
  }

  const readableRadius = 0.06 + Math.sqrt(body.physical.radiusKm / EARTH_RADIUS_KM) * 0.115;
  const cap = body.type === "moon" || body.type === "dwarfPlanet" ? 0.22 : 0.72;
  const minimum = body.type === "moon" ? 0.075 : 0.11;

  return Math.min(Math.max(readableRadius, minimum), cap);
};

export const computeScenePositions = (
  bodies: CelestialBody[],
  date: Date,
  mode: ScaleMode,
): Record<string, Vec3> => {
  const positions: Record<string, Vec3> = {};
  const pending = [...bodies];
  let guard = 0;

  while (pending.length > 0 && guard < bodies.length * 3) {
    guard += 1;
    const body = pending.shift()!;

    if (!body.parentId || !body.orbit) {
      positions[body.id] = [0, 0, 0];
      continue;
    }

    const parentPosition = positions[body.parentId];
    if (!parentPosition) {
      pending.push(body);
      continue;
    }

    const localPositionKm = getOrbitPositionKm(body.orbit, date);

    if (body.type === "moon") {
      positions[body.id] = addVec3(parentPosition, scaleMoonOffset(localPositionKm, mode));
      continue;
    }

    positions[body.id] = scaleVectorFromSun(localPositionKm, mode);
  }

  return positions;
};

export const computeBodyScenePosition = (
  body: CelestialBody,
  bodiesById: Map<string, CelestialBody>,
  date: Date,
  mode: ScaleMode,
): Vec3 => {
  if (!body.orbit || !body.parentId) {
    return [0, 0, 0];
  }

  const localKm = getOrbitPositionKm(body.orbit, date);

  if (body.type === "moon") {
    const parent = bodiesById.get(body.parentId);
    const parentScene: Vec3 = parent
      ? computeBodyScenePosition(parent, bodiesById, date, mode)
      : [0, 0, 0];
    return addVec3(parentScene, scaleMoonOffset(localKm, mode));
  }

  return scaleVectorFromSun(localKm, mode);
};

export const scaleOrbitPoint = (
  pointKm: Vec3,
  mode: ScaleMode,
  bodyType: CelestialBody["type"],
  parentScenePosition: Vec3 = [0, 0, 0],
) => {
  if (bodyType === "moon") {
    return addVec3(parentScenePosition, scaleMoonOffset(pointKm, mode));
  }

  return scaleVectorFromSun(pointKm, mode);
};

export const formatDistance = (km: number) => {
  if (km >= AU_KM * 0.1) {
    return `${(km / AU_KM).toFixed(km > AU_KM * 10 ? 1 : 2)} AU`;
  }

  return `${Math.round(km).toLocaleString()} km`;
};

export const formatRadius = (km: number) => `${Math.round(km).toLocaleString()} km`;

export const formatPeriod = (days: number) => {
  if (days >= 365.256) {
    return `${(days / 365.256).toFixed(days > 5_000 ? 1 : 2)} yr`;
  }

  return `${days.toFixed(days < 10 ? 2 : 1)} d`;
};
