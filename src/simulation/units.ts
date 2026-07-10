import { AU_KM, DAY_SECONDS, EARTH_RADIUS_KM } from "../data/constants";
import type { CelestialBody, Vec3 } from "./orbitalElements";
import { addVec3, getOrbitPositionKm, vectorLength } from "./solveOrbit";

export type ScaleMode = "real" | "readable" | "compressed" | "overview";
export type LabelDensity = "off" | "minimal" | "standard" | "full";

export const SCALE_MODES: Array<{ id: ScaleMode; label: string; note: string }> = [
  { id: "real", label: "Real", note: "True distance and true radius" },
  {
    id: "readable",
    label: "Readable",
    note: "True planet distance · enlarged bodies and expanded moon systems",
  },
  { id: "compressed", label: "Compact", note: "Recommended compressed distance with readable body size" },
  { id: "overview", label: "Map", note: "System overview scale" },
];

export const formatBodyType = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

const realUnitsPerAu = 7;
export const READABLE_MOON_DISTANCE_EXPONENT = 0.42;
export const READABLE_MOON_DISTANCE_MULTIPLIER = 0.4;
export const READABLE_MOON_MIN_CLEARANCE = 0.18;

export type MoonScaleContext = {
  parentBody?: CelestialBody;
  moonBody?: CelestialBody;
};

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

const scaleReadableMoonDistance = (distanceKm: number, context?: MoonScaleContext) => {
  const fallbackDistance =
    Math.pow(distanceKm / 100_000, READABLE_MOON_DISTANCE_EXPONENT) * READABLE_MOON_DISTANCE_MULTIPLIER;

  if (!context?.parentBody || !context.moonBody || context.parentBody.physical.radiusKm <= 0) {
    return fallbackDistance;
  }

  const parentRadius = getBodySceneRadius(context.parentBody, "readable");
  const moonRadius = getBodySceneRadius(context.moonBody, "readable");
  const distanceInParentRadii = Math.max(distanceKm / context.parentBody.physical.radiusKm, 1);
  const readableSpread =
    parentRadius * Math.pow(distanceInParentRadii, READABLE_MOON_DISTANCE_EXPONENT) * READABLE_MOON_DISTANCE_MULTIPLIER;
  const minimumDistance = parentRadius + moonRadius + READABLE_MOON_MIN_CLEARANCE;

  return Math.max(fallbackDistance, minimumDistance + readableSpread);
};

export const scaleMoonOffset = (offsetKm: Vec3, mode: ScaleMode, context?: MoonScaleContext): Vec3 => {
  const distanceKm = vectorLength(offsetKm);
  if (distanceKm === 0) {
    return [0, 0, 0];
  }

  const trueDistance = (distanceKm / AU_KM) * realUnitsPerAu;

  if (mode === "real") {
    return multiply(normalize(offsetKm), trueDistance);
  }

  if (mode === "readable") {
    return multiply(normalize(offsetKm), Math.max(trueDistance, scaleReadableMoonDistance(distanceKm, context)));
  }

  if (mode === "compressed") {
    return multiply(normalize(offsetKm), Math.pow(distanceKm / 100_000, 0.74) * 0.72);
  }

  return multiply(normalize(offsetKm), Math.pow(distanceKm / 100_000, 0.52) * 0.32);
};

const ORIGIN: Vec3 = [0, 0, 0];

// Parent-before-child ordering, computed once per body-list identity. The per-frame
// position pass can then be a single forward loop instead of re-spreading and
// shift()-ing a work queue (with its guard counter) on every frame.
const sceneOrderCache = new WeakMap<CelestialBody[], CelestialBody[]>();
const getDependencyOrder = (bodies: CelestialBody[]): CelestialBody[] => {
  const cached = sceneOrderCache.get(bodies);
  if (cached) {
    return cached;
  }

  const placed = new Set<string>();
  const ordered: CelestialBody[] = [];
  const pending = [...bodies];
  let guard = 0;

  while (pending.length > 0 && guard < bodies.length * 3) {
    guard += 1;
    const body = pending.shift()!;
    if (!body.parentId || !body.orbit || placed.has(body.parentId)) {
      ordered.push(body);
      placed.add(body.id);
    } else {
      pending.push(body);
    }
  }
  // Defensive: surface any unresolved cycle / missing parent rather than dropping bodies.
  ordered.push(...pending);

  sceneOrderCache.set(bodies, ordered);
  return ordered;
};

// Writes x/y/z into target[id], reusing the existing tuple in place so the per-frame
// pass allocates no new result arrays for positions already present in the ref.
const writeScenePosition = (target: Record<string, Vec3>, id: string, x: number, y: number, z: number) => {
  const existing = target[id];
  if (existing) {
    existing[0] = x;
    existing[1] = y;
    existing[2] = z;
  } else {
    target[id] = [x, y, z];
  }
};

export const computeScenePositions = (
  bodies: CelestialBody[],
  bodiesById: Map<string, CelestialBody>,
  date: Date,
  mode: ScaleMode,
  target: Record<string, Vec3> = {},
): Record<string, Vec3> => {
  for (const body of getDependencyOrder(bodies)) {
    if (!body.parentId || !body.orbit) {
      writeScenePosition(target, body.id, 0, 0, 0);
      continue;
    }

    const localPositionKm = getOrbitPositionKm(body.orbit, date);

    if (body.type === "moon") {
      const parentPosition = target[body.parentId] ?? ORIGIN;
      const offset = scaleMoonOffset(localPositionKm, mode, {
        parentBody: bodiesById.get(body.parentId),
        moonBody: body,
      });
      writeScenePosition(
        target,
        body.id,
        parentPosition[0] + offset[0],
        parentPosition[1] + offset[1],
        parentPosition[2] + offset[2],
      );
      continue;
    }

    const scaled = scaleVectorFromSun(localPositionKm, mode);
    writeScenePosition(target, body.id, scaled[0], scaled[1], scaled[2]);
  }

  return target;
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
    return addVec3(parentScene, scaleMoonOffset(localKm, mode, { parentBody: parent, moonBody: body }));
  }

  return scaleVectorFromSun(localKm, mode);
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

// Compact, always-accurate label for the live time scale (sim-seconds per real
// second). Drives the speed-slider readout so it never disagrees with the clock.
const timeScaleUnits: Array<[number, string]> = [
  [DAY_SECONDS * 365.256, "yr"],
  [DAY_SECONDS * 30.437, "mo"],
  [DAY_SECONDS * 7, "wk"],
  [DAY_SECONDS, "day"],
  [3_600, "hr"],
  [60, "min"],
  [1, "sec"],
];

export const formatTimeScale = (secondsPerSecond: number) => {
  if (secondsPerSecond < 1.5) {
    return "real-time";
  }

  for (const [size, label] of timeScaleUnits) {
    if (secondsPerSecond >= size) {
      const value = secondsPerSecond / size;
      const text = Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
      return `${text} ${label}/s`;
    }
  }

  return `${Math.round(secondsPerSecond)} sec/s`;
};

// Signed offset of the scrub position from real "now", for the timeline readout.
export const formatNowDelta = (deltaDays: number) => {
  const abs = Math.abs(deltaDays);
  if (abs < 1) {
    return "now";
  }

  const sign = deltaDays > 0 ? "+" : "−";
  if (abs >= 365.256) {
    return `${sign}${(abs / 365.256).toFixed(1)} yr`;
  }
  if (abs >= 30.437) {
    return `${sign}${(abs / 30.437).toFixed(1)} mo`;
  }

  return `${sign}${Math.round(abs)} d`;
};
