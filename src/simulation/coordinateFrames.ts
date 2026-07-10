import type { OrbitReferenceFrame, Vec3 } from "./orbitalElements";

/** Fixed obliquity Horizons uses for ICRF ↔ IAU76/80 J2000 ecliptic output. */
export const ECLIPTIC_J2000_OBLIQUITY_DEG = 84_381.448 / 3_600;

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.sqrt(x * x + y * y + z * z);
  return length === 0 ? [0, 0, 0] : [x / length, y / length, z / length];
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const eclipticVectorToScene = ([x, y, z]: Vec3): Vec3 => [x, z, y];

/** Convert ICRF-equatorial components into the scene's x/ecliptic-z/ecliptic-y axes. */
export const icrfVectorToScene = ([x, y, z]: Vec3): Vec3 => {
  const obliquity = degToRad(ECLIPTIC_J2000_OBLIQUITY_DEG);
  const eclipticY = Math.cos(obliquity) * y + Math.sin(obliquity) * z;
  const eclipticZ = -Math.sin(obliquity) * y + Math.cos(obliquity) * z;
  return [x, eclipticZ, eclipticY];
};

/**
 * Rotate components expressed in a local Laplace/body-equator plane into ICRF.
 * JPL defines the local +X axis as the ascending node of that reference plane on
 * the ICRF equator; local +Z is the supplied plane pole.
 */
export const referencePlaneVectorToIcrf = (
  [x, y, z]: Vec3,
  poleRightAscensionDeg: number,
  poleDeclinationDeg: number,
): Vec3 => {
  const rightAscension = degToRad(poleRightAscensionDeg);
  const declination = degToRad(poleDeclinationDeg);
  const pole: Vec3 = [
    Math.cos(declination) * Math.cos(rightAscension),
    Math.cos(declination) * Math.sin(rightAscension),
    Math.sin(declination),
  ];
  const ascendingNode: Vec3 = [-Math.sin(rightAscension), Math.cos(rightAscension), 0];
  const inPlaneQuarterTurn = normalize(cross(pole, ascendingNode));

  return [
    x * ascendingNode[0] + y * inPlaneQuarterTurn[0] + z * pole[0],
    x * ascendingNode[1] + y * inPlaneQuarterTurn[1] + z * pole[1],
    x * ascendingNode[2] + y * inPlaneQuarterTurn[2] + z * pole[2],
  ];
};

export const orbitFrameVectorToScene = (vector: Vec3, frame?: OrbitReferenceFrame): Vec3 => {
  if (!frame || frame.id === "ecliptic-j2000") {
    return eclipticVectorToScene(vector);
  }
  if (frame.id === "icrf-equatorial") {
    return icrfVectorToScene(vector);
  }
  return icrfVectorToScene(
    referencePlaneVectorToIcrf(vector, frame.poleRightAscensionDeg, frame.poleDeclinationDeg),
  );
};
