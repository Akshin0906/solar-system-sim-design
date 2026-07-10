import { J2000_EPOCH } from "./constants";
import { PCK_ORIENTATION_METADATA } from "./scientificMetadata";
import type { OrientationModel } from "../simulation/orbitalElements";

type PckCoefficients = {
  rightAscensionDeg: number;
  declinationDeg: number;
  primeMeridianDeg: number;
  primeMeridianRateDegPerDay: number;
  rightAscensionRateDegPerCentury?: number;
  declinationRateDegPerCentury?: number;
  primeMeridianAccelerationDegPerDay2?: number;
};

const pck = (coefficients: PckCoefficients, synchronousParentId?: string): OrientationModel => ({
  kind: "iau-pck",
  epoch: J2000_EPOCH,
  epochTimeScale: "TDB",
  pole: {
    rightAscensionDeg: coefficients.rightAscensionDeg,
    declinationDeg: coefficients.declinationDeg,
    rightAscensionRateDegPerCentury: coefficients.rightAscensionRateDegPerCentury,
    declinationRateDegPerCentury: coefficients.declinationRateDegPerCentury,
  },
  primeMeridian: {
    angleDeg: coefficients.primeMeridianDeg,
    rateDegPerDay: coefficients.primeMeridianRateDegPerDay,
    accelerationDegPerDay2: coefficients.primeMeridianAccelerationDegPerDay2,
  },
  synchronous: synchronousParentId ? { parentId: synchronousParentId, subParentLongitudeDeg: 0 } : undefined,
  metadata: PCK_ORIENTATION_METADATA,
});

/**
 * Secular coefficients from NAIF's generic pck00011.tpc.  Signed W rate is the
 * sole spin-direction encoding; callers must not also negate rotation periods.
 */
export const BODY_ORIENTATIONS: Readonly<Record<string, OrientationModel>> = {
  sun: pck({ rightAscensionDeg: 286.13, declinationDeg: 63.87, primeMeridianDeg: 84.176, primeMeridianRateDegPerDay: 14.1844 }),
  mercury: pck({
    rightAscensionDeg: 281.0103,
    declinationDeg: 61.4155,
    rightAscensionRateDegPerCentury: -0.0328,
    declinationRateDegPerCentury: -0.0049,
    primeMeridianDeg: 329.5988,
    primeMeridianRateDegPerDay: 6.1385108,
  }),
  venus: pck({ rightAscensionDeg: 272.76, declinationDeg: 67.16, primeMeridianDeg: 160.2, primeMeridianRateDegPerDay: -1.4813688 }),
  earth: pck({
    rightAscensionDeg: 0,
    declinationDeg: 90,
    rightAscensionRateDegPerCentury: -0.641,
    declinationRateDegPerCentury: -0.557,
    primeMeridianDeg: 190.147,
    primeMeridianRateDegPerDay: 360.9856235,
  }),
  mars: pck({
    rightAscensionDeg: 317.269202,
    declinationDeg: 54.432516,
    rightAscensionRateDegPerCentury: -0.10927547,
    declinationRateDegPerCentury: -0.05827105,
    primeMeridianDeg: 176.049863,
    primeMeridianRateDegPerDay: 350.891982443297,
  }),
  jupiter: pck({
    rightAscensionDeg: 268.056595,
    declinationDeg: 64.495303,
    rightAscensionRateDegPerCentury: -0.006499,
    declinationRateDegPerCentury: 0.002413,
    primeMeridianDeg: 284.95,
    primeMeridianRateDegPerDay: 870.536,
  }),
  saturn: pck({
    rightAscensionDeg: 40.589,
    declinationDeg: 83.537,
    rightAscensionRateDegPerCentury: -0.036,
    declinationRateDegPerCentury: -0.004,
    primeMeridianDeg: 38.9,
    primeMeridianRateDegPerDay: 810.7939024,
  }),
  uranus: pck({ rightAscensionDeg: 257.311, declinationDeg: -15.175, primeMeridianDeg: 203.81, primeMeridianRateDegPerDay: -501.1600928 }),
  neptune: pck({ rightAscensionDeg: 299.36, declinationDeg: 43.46, primeMeridianDeg: 249.978, primeMeridianRateDegPerDay: 541.1397757 }),
  pluto: pck({ rightAscensionDeg: 132.993, declinationDeg: -6.163, primeMeridianDeg: 302.695, primeMeridianRateDegPerDay: 56.3625225 }),
  ceres: pck({ rightAscensionDeg: 291.418, declinationDeg: 66.764, primeMeridianDeg: 170.65, primeMeridianRateDegPerDay: 952.1532 }),

  moon: pck({
    rightAscensionDeg: 269.9949,
    declinationDeg: 66.5392,
    rightAscensionRateDegPerCentury: 0.0031,
    declinationRateDegPerCentury: 0.013,
    primeMeridianDeg: 38.3213,
    primeMeridianRateDegPerDay: 13.17635815,
    primeMeridianAccelerationDegPerDay2: -1.4e-12,
  }, "earth"),
  io: pck({ rightAscensionDeg: 268.05, declinationDeg: 64.5, rightAscensionRateDegPerCentury: -0.009, declinationRateDegPerCentury: 0.003, primeMeridianDeg: 200.39, primeMeridianRateDegPerDay: 203.4889538 }, "jupiter"),
  europa: pck({ rightAscensionDeg: 268.08, declinationDeg: 64.51, rightAscensionRateDegPerCentury: -0.009, declinationRateDegPerCentury: 0.003, primeMeridianDeg: 36.022, primeMeridianRateDegPerDay: 101.3747235 }, "jupiter"),
  ganymede: pck({ rightAscensionDeg: 268.2, declinationDeg: 64.57, rightAscensionRateDegPerCentury: -0.009, declinationRateDegPerCentury: 0.003, primeMeridianDeg: 44.064, primeMeridianRateDegPerDay: 50.3176081 }, "jupiter"),
  callisto: pck({ rightAscensionDeg: 268.72, declinationDeg: 64.83, rightAscensionRateDegPerCentury: -0.009, declinationRateDegPerCentury: 0.003, primeMeridianDeg: 259.51, primeMeridianRateDegPerDay: 21.5710715 }, "jupiter"),
  enceladus: pck({ rightAscensionDeg: 40.66, declinationDeg: 83.52, rightAscensionRateDegPerCentury: -0.036, declinationRateDegPerCentury: -0.004, primeMeridianDeg: 6.32, primeMeridianRateDegPerDay: 262.7318996 }, "saturn"),
  rhea: pck({ rightAscensionDeg: 40.38, declinationDeg: 83.55, rightAscensionRateDegPerCentury: -0.036, declinationRateDegPerCentury: -0.004, primeMeridianDeg: 235.16, primeMeridianRateDegPerDay: 79.6900478 }, "saturn"),
  titan: pck({ rightAscensionDeg: 39.4827, declinationDeg: 83.4279, primeMeridianDeg: 186.5855, primeMeridianRateDegPerDay: 22.5769768 }, "saturn"),
  iapetus: pck({ rightAscensionDeg: 318.16, declinationDeg: 75.03, rightAscensionRateDegPerCentury: -3.949, declinationRateDegPerCentury: -1.143, primeMeridianDeg: 355.2, primeMeridianRateDegPerDay: 4.5379572 }, "saturn"),
  ariel: pck({ rightAscensionDeg: 257.43, declinationDeg: -15.1, primeMeridianDeg: 156.22, primeMeridianRateDegPerDay: -142.8356681 }, "uranus"),
  umbriel: pck({ rightAscensionDeg: 257.43, declinationDeg: -15.1, primeMeridianDeg: 108.05, primeMeridianRateDegPerDay: -86.8688923 }, "uranus"),
  titania: pck({ rightAscensionDeg: 257.43, declinationDeg: -15.1, primeMeridianDeg: 77.74, primeMeridianRateDegPerDay: -41.3514316 }, "uranus"),
  oberon: pck({ rightAscensionDeg: 257.43, declinationDeg: -15.1, primeMeridianDeg: 6.77, primeMeridianRateDegPerDay: -26.7394932 }, "uranus"),
  miranda: pck({ rightAscensionDeg: 257.43, declinationDeg: -15.08, primeMeridianDeg: 30.7, primeMeridianRateDegPerDay: -254.6906892 }, "uranus"),
  triton: pck({ rightAscensionDeg: 299.36, declinationDeg: 41.17, primeMeridianDeg: 296.53, primeMeridianRateDegPerDay: -61.2572637 }, "neptune"),
};
