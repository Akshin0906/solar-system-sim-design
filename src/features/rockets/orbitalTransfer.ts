import type { Vec3 } from "../../simulation/orbitalElements";
import { addVec3 as add, mulVec3 as mul, subVec3 as sub, vectorLength } from "../../simulation/vec3";

const TWO_PI = Math.PI * 2;
const ROOT_EPSILON = 1e-8;
const GEOMETRY_EPSILON = 1e-12;

export type StateVector = {
  positionKm: Vec3;
  velocityKmS: Vec3;
};

export type LambertSolution = {
  departureVelocityKmS: Vec3;
  arrivalVelocityKmS: Vec3;
  transferAngleRad: number;
  prograde: boolean;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const finiteVec3 = (value: Vec3) => value.every(Number.isFinite);

export const stumpffC = (z: number) => {
  if (z > ROOT_EPSILON) {
    const root = Math.sqrt(z);
    return (1 - Math.cos(root)) / z;
  }
  if (z < -ROOT_EPSILON) {
    const root = Math.sqrt(-z);
    return (Math.cosh(root) - 1) / -z;
  }
  return 0.5 - z / 24 + (z * z) / 720;
};

export const stumpffS = (z: number) => {
  if (z > ROOT_EPSILON) {
    const root = Math.sqrt(z);
    return (root - Math.sin(root)) / root ** 3;
  }
  if (z < -ROOT_EPSILON) {
    const root = Math.sqrt(-z);
    return (Math.sinh(root) - root) / root ** 3;
  }
  return 1 / 6 - z / 120 + (z * z) / 5_040;
};

const bisectRoot = (fn: (value: number) => number, lowerStart: number, upperStart: number) => {
  let lower = lowerStart;
  let upper = upperStart;
  let lowerValue = fn(lower);
  let upperValue = fn(upper);
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue) || lowerValue * upperValue > 0) {
    return null;
  }

  for (let index = 0; index < 120; index += 1) {
    const mid = (lower + upper) / 2;
    const midValue = fn(mid);
    if (!Number.isFinite(midValue)) {
      return null;
    }
    if (Math.abs(midValue) < ROOT_EPSILON) {
      return mid;
    }
    if (lowerValue * midValue <= 0) {
      upper = mid;
      upperValue = midValue;
    } else {
      lower = mid;
      lowerValue = midValue;
    }
  }

  return (lower + upper) / 2;
};

/**
 * Solve the zero-revolution Lambert boundary-value problem with universal variables.
 *
 * The app's inertial coordinates use the X/Z plane for the ecliptic and +Y as its
 * visual normal. Prograde planetary motion therefore has a negative Y cross product,
 * the opposite sign from the conventional X/Y derivation.
 */
export const solveLambertUniversal = (
  departurePositionKm: Vec3,
  arrivalPositionKm: Vec3,
  transferTimeSeconds: number,
  muKm3S2: number,
  prograde = true,
): LambertSolution | null => {
  const departureRadiusKm = vectorLength(departurePositionKm);
  const arrivalRadiusKm = vectorLength(arrivalPositionKm);
  if (
    departureRadiusKm <= 0 ||
    arrivalRadiusKm <= 0 ||
    transferTimeSeconds <= 0 ||
    muKm3S2 <= 0
  ) {
    return null;
  }

  const cosine = Math.min(
    Math.max(dot(departurePositionKm, arrivalPositionKm) / (departureRadiusKm * arrivalRadiusKm), -1),
    1,
  );
  const baseAngle = Math.acos(cosine);
  const crossY = cross(departurePositionKm, arrivalPositionKm)[1];
  const followsProgradeShortWay = crossY <= 0;
  const shortWay = prograde ? followsProgradeShortWay : !followsProgradeShortWay;
  const transferAngleRad = shortWay ? baseAngle : TWO_PI - baseAngle;
  const sine = Math.sin(transferAngleRad);
  const denominator = 1 - cosine;
  if (Math.abs(sine) < GEOMETRY_EPSILON || denominator <= GEOMETRY_EPSILON) {
    return null;
  }

  const aParameter = sine * Math.sqrt((departureRadiusKm * arrivalRadiusKm) / denominator);
  if (!Number.isFinite(aParameter) || Math.abs(aParameter) < GEOMETRY_EPSILON) {
    return null;
  }

  const timeResidual = (z: number) => {
    const c = stumpffC(z);
    const s = stumpffS(z);
    if (!Number.isFinite(c) || !Number.isFinite(s) || c <= 0) {
      return Number.NaN;
    }
    const y = departureRadiusKm + arrivalRadiusKm + (aParameter * (z * s - 1)) / Math.sqrt(c);
    if (!Number.isFinite(y) || y <= 0) {
      return Number.NaN;
    }
    const x = Math.sqrt(y / c);
    return (x ** 3 * s + aParameter * Math.sqrt(y)) / Math.sqrt(muKm3S2) - transferTimeSeconds;
  };

  // Scan the useful zero-revolution range for the first finite sign change. This is
  // more defensive than assuming z=0 is on a particular side for every geometry.
  const minZ = -4 * Math.PI * Math.PI;
  const maxZ = 4 * Math.PI * Math.PI;
  const scanSteps = 640;
  let previous: { z: number; residual: number } | null = null;
  let bracket: [number, number] | null = null;
  for (let index = 0; index <= scanSteps; index += 1) {
    const z = minZ + ((maxZ - minZ) * index) / scanSteps;
    const residual = timeResidual(z);
    if (!Number.isFinite(residual)) {
      continue;
    }
    if (previous && previous.residual * residual <= 0) {
      bracket = [previous.z, z];
      break;
    }
    previous = { z, residual };
  }
  if (!bracket) {
    return null;
  }

  const z = bisectRoot(timeResidual, bracket[0], bracket[1]);
  if (z === null) {
    return null;
  }
  const c = stumpffC(z);
  const s = stumpffS(z);
  const y = departureRadiusKm + arrivalRadiusKm + (aParameter * (z * s - 1)) / Math.sqrt(c);
  const f = 1 - y / departureRadiusKm;
  const g = aParameter * Math.sqrt(y / muKm3S2);
  const gDot = 1 - y / arrivalRadiusKm;
  if (!Number.isFinite(g) || Math.abs(g) < GEOMETRY_EPSILON) {
    return null;
  }

  const departureVelocityKmS = mul(sub(arrivalPositionKm, mul(departurePositionKm, f)), 1 / g);
  const arrivalVelocityKmS = mul(sub(mul(arrivalPositionKm, gDot), departurePositionKm), 1 / g);
  if (!finiteVec3(departureVelocityKmS) || !finiteVec3(arrivalVelocityKmS)) {
    return null;
  }

  return { departureVelocityKmS, arrivalVelocityKmS, transferAngleRad, prograde };
};

/** Propagate a Cartesian state through a point-mass gravity field. */
export const propagateTwoBody = (
  initialPositionKm: Vec3,
  initialVelocityKmS: Vec3,
  elapsedSeconds: number,
  muKm3S2: number,
): StateVector | null => {
  const initialRadiusKm = vectorLength(initialPositionKm);
  if (initialRadiusKm <= 0 || muKm3S2 <= 0 || !Number.isFinite(elapsedSeconds)) {
    return null;
  }
  if (elapsedSeconds === 0) {
    return { positionKm: [...initialPositionKm], velocityKmS: [...initialVelocityKmS] };
  }

  const speedSquared = dot(initialVelocityKmS, initialVelocityKmS);
  const radialVelocityKmS = dot(initialPositionKm, initialVelocityKmS) / initialRadiusKm;
  const alpha = 2 / initialRadiusKm - speedSquared / muKm3S2;
  const sqrtMu = Math.sqrt(muKm3S2);
  let chi =
    Math.abs(alpha) > GEOMETRY_EPSILON
      ? sqrtMu * Math.abs(alpha) * elapsedSeconds
      : (sqrtMu * elapsedSeconds) / initialRadiusKm;

  for (let index = 0; index < 80; index += 1) {
    const z = alpha * chi * chi;
    const c = stumpffC(z);
    const s = stumpffS(z);
    const residual =
      (initialRadiusKm * radialVelocityKmS * chi * chi * c) / sqrtMu +
      (1 - alpha * initialRadiusKm) * chi ** 3 * s +
      initialRadiusKm * chi -
      sqrtMu * elapsedSeconds;
    const derivative =
      (initialRadiusKm * radialVelocityKmS * chi * (1 - z * s)) / sqrtMu +
      (1 - alpha * initialRadiusKm) * chi * chi * c +
      initialRadiusKm;
    if (!Number.isFinite(residual) || !Number.isFinite(derivative) || Math.abs(derivative) < GEOMETRY_EPSILON) {
      return null;
    }
    const step = residual / derivative;
    chi -= step;
    if (Math.abs(step) < ROOT_EPSILON) {
      break;
    }
  }

  const z = alpha * chi * chi;
  const c = stumpffC(z);
  const s = stumpffS(z);
  const f = 1 - (chi * chi * c) / initialRadiusKm;
  const g = elapsedSeconds - (chi ** 3 * s) / sqrtMu;
  const positionKm = add(mul(initialPositionKm, f), mul(initialVelocityKmS, g));
  const radiusKm = vectorLength(positionKm);
  if (radiusKm <= 0 || !finiteVec3(positionKm)) {
    return null;
  }
  const fDot = (sqrtMu * chi * (z * s - 1)) / (radiusKm * initialRadiusKm);
  const gDot = 1 - (chi * chi * c) / radiusKm;
  const velocityKmS = add(mul(initialPositionKm, fDot), mul(initialVelocityKmS, gDot));
  return finiteVec3(velocityKmS) ? { positionKm, velocityKmS } : null;
};

export const sampleTwoBodyTrajectory = (
  initialPositionKm: Vec3,
  initialVelocityKmS: Vec3,
  durationSeconds: number,
  muKm3S2: number,
  samples = 120,
) => {
  const points: Vec3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const state = propagateTwoBody(
      initialPositionKm,
      initialVelocityKmS,
      (durationSeconds * index) / samples,
      muKm3S2,
    );
    if (!state) {
      return null;
    }
    points.push(state.positionKm);
  }
  return points;
};

export const measureTrajectoryKm = (points: Vec3[]) =>
  points.reduce(
    (distanceKm, point, index) =>
      index === 0 ? distanceKm : distanceKm + vectorLength(sub(point, points[index - 1])),
    0,
  );

export const estimateVelocityKmS = (
  positionAt: (date: Date) => Vec3,
  dateMs: number,
  sampleSeconds = 120,
): Vec3 => {
  const halfWindowMs = (sampleSeconds * 1_000) / 2;
  const before = positionAt(new Date(dateMs - halfWindowMs));
  const after = positionAt(new Date(dateMs + halfWindowMs));
  return mul(sub(after, before), 1 / sampleSeconds);
};
