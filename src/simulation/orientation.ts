import { DAY_MS } from "../data/constants";
import type { CelestialBody, OrientationModel, Vec3 } from "./orbitalElements";
import { degToRad, getOrbitPositionKm } from "./solveOrbit";
import { icrfVectorToScene } from "./coordinateFrames";
import { normalizeVec3 } from "./vec3";

const DAYS_PER_JULIAN_CENTURY = 36_525;

const normalizeDegrees = (degrees: number) => {
  const result = degrees % 360;
  return result < 0 ? result + 360 : result;
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const scale = (vector: Vec3, factor: number): Vec3 => [
  vector[0] * factor,
  vector[1] * factor,
  vector[2] * factor,
];

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export type ResolvedOrientation = {
  rightAscensionDeg: number;
  declinationDeg: number;
  primeMeridianDeg: number;
  /** Signed W rate: this, and only this, encodes prograde/retrograde spin. */
  primeMeridianRateDegPerDay: number;
};

export const getPckOrientationAtDate = (model: OrientationModel, date: Date): ResolvedOrientation => {
  const elapsedDays = (date.getTime() - Date.parse(model.epoch)) / DAY_MS;
  const centuries = elapsedDays / DAYS_PER_JULIAN_CENTURY;
  return {
    rightAscensionDeg:
      model.pole.rightAscensionDeg + (model.pole.rightAscensionRateDegPerCentury ?? 0) * centuries,
    declinationDeg:
      model.pole.declinationDeg + (model.pole.declinationRateDegPerCentury ?? 0) * centuries,
    primeMeridianDeg: normalizeDegrees(
      model.primeMeridian.angleDeg +
        model.primeMeridian.rateDegPerDay * elapsedDays +
        (model.primeMeridian.accelerationDegPerDay2 ?? 0) * elapsedDays * elapsedDays,
    ),
    primeMeridianRateDegPerDay: model.primeMeridian.rateDegPerDay,
  };
};

export type BodyOrientationAxes = {
  /** Body +X / zero-longitude direction, expressed in scene axes. */
  xAxis: Vec3;
  /** Body +Y direction, expressed in scene axes. */
  yAxis: Vec3;
  /** Body north pole / +Z direction, expressed in scene axes. */
  zAxis: Vec3;
  angles: ResolvedOrientation;
  mode: "pck" | "synchronous";
};

const getPckAxesIcrf = (angles: ResolvedOrientation): [Vec3, Vec3, Vec3] => {
  const rightAscension = degToRad(angles.rightAscensionDeg);
  const declination = degToRad(angles.declinationDeg);
  const primeMeridian = degToRad(angles.primeMeridianDeg);
  const zAxis: Vec3 = [
    Math.cos(declination) * Math.cos(rightAscension),
    Math.cos(declination) * Math.sin(rightAscension),
    Math.sin(declination),
  ];
  // Direction of the body-equator ascending node on the ICRF equator.  The
  // RA-derived form stays well-defined for a pole at exactly +90° declination.
  const node: Vec3 = [-Math.sin(rightAscension), Math.cos(rightAscension), 0];
  const quarterTurn = normalizeVec3(cross(zAxis, node));
  const xAxis = normalizeVec3([
    node[0] * Math.cos(primeMeridian) + quarterTurn[0] * Math.sin(primeMeridian),
    node[1] * Math.cos(primeMeridian) + quarterTurn[1] * Math.sin(primeMeridian),
    node[2] * Math.cos(primeMeridian) + quarterTurn[2] * Math.sin(primeMeridian),
  ]);
  return [xAxis, normalizeVec3(cross(zAxis, xAxis)), normalizeVec3(zAxis)];
};

export const getBodyOrientationAxes = (body: CelestialBody, date: Date): BodyOrientationAxes | null => {
  const model = body.physical.orientation;
  if (!model) {
    return null;
  }

  const angles = getPckOrientationAtDate(model, date);
  const [pckX, , pckZ] = getPckAxesIcrf(angles);
  const zAxis = normalizeVec3(icrfVectorToScene(pckZ));

  if (model.synchronous && body.orbit && body.parentId === model.synchronous.parentId) {
    const localPosition = getOrbitPositionKm(body.orbit, date);
    const towardParent = normalizeVec3(scale(localPosition, -1));
    const projected = normalizeVec3(subtract(towardParent, scale(zAxis, dot(towardParent, zAxis))));
    if (dot(projected, projected) > 0) {
      const offset = degToRad(model.synchronous.subParentLongitudeDeg ?? 0);
      const quarterTurn = normalizeVec3(cross(zAxis, projected));
      const xAxis = normalizeVec3([
        projected[0] * Math.cos(offset) + quarterTurn[0] * Math.sin(offset),
        projected[1] * Math.cos(offset) + quarterTurn[1] * Math.sin(offset),
        projected[2] * Math.cos(offset) + quarterTurn[2] * Math.sin(offset),
      ]);
      return {
        xAxis,
        yAxis: normalizeVec3(cross(zAxis, xAxis)),
        zAxis,
        angles,
        mode: "synchronous",
      };
    }
  }

  const xAxis = normalizeVec3(icrfVectorToScene(pckX));
  return {
    xAxis,
    // ICRF -> scene swaps astronomical Y/Z and is therefore a reflection.
    // Rebuild the third body axis in Three's right-handed scene coordinates.
    yAxis: normalizeVec3(cross(zAxis, xAxis)),
    zAxis,
    angles,
    mode: "pck",
  };
};
