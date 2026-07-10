import { AU_KM, DAY_SECONDS } from "../src/data/constants";
import type { Vec3 } from "../src/simulation/orbitalElements";
import { subVec3, vectorLength } from "../src/simulation/vec3";
import {
  measureTrajectoryKm,
  propagateTwoBody,
  sampleTwoBodyTrajectory,
  solveLambertUniversal,
} from "../src/features/rockets/orbitalTransfer";

const MU_SUN_KM3_S2 = 132_712_440_018;

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const circularPosition = (radiusKm: number, angleRad: number): Vec3 => [
  radiusKm * Math.cos(angleRad),
  0,
  radiusKm * Math.sin(angleRad),
];

const runCase = (label: string, destinationAu: number) => {
  const originRadiusKm = AU_KM;
  const destinationRadiusKm = destinationAu * AU_KM;
  const transferSemiMajorAxisKm = (originRadiusKm + destinationRadiusKm) / 2;
  const transferTimeSeconds = Math.PI * Math.sqrt(transferSemiMajorAxisKm ** 3 / MU_SUN_KM3_S2);
  const departurePositionKm = circularPosition(originRadiusKm, 0);
  const arrivalPositionKm = circularPosition(destinationRadiusKm, Math.PI + (10 * Math.PI) / 180);
  const solution = solveLambertUniversal(
    departurePositionKm,
    arrivalPositionKm,
    transferTimeSeconds,
    MU_SUN_KM3_S2,
  );
  assert(solution, `${label}: Lambert solution missing`);
  const propagated = propagateTwoBody(
    departurePositionKm,
    solution!.departureVelocityKmS,
    transferTimeSeconds,
    MU_SUN_KM3_S2,
  );
  assert(propagated, `${label}: propagation failed`);
  const endpointErrorKm = vectorLength(subVec3(propagated!.positionKm, arrivalPositionKm));
  const arrivalVelocityErrorKmS = vectorLength(
    subVec3(propagated!.velocityKmS, solution!.arrivalVelocityKmS),
  );
  assert(endpointErrorKm < 0.1, `${label}: endpoint error ${endpointErrorKm} km`);
  assert(arrivalVelocityErrorKmS < 1e-6, `${label}: velocity error ${arrivalVelocityErrorKmS} km/s`);

  const points = sampleTwoBodyTrajectory(
    departurePositionKm,
    solution!.departureVelocityKmS,
    transferTimeSeconds,
    MU_SUN_KM3_S2,
    400,
  );
  assert(points, `${label}: sampling failed`);
  const routeLengthKm = measureTrajectoryKm(points!);
  const meanSpeedKmS = routeLengthKm / transferTimeSeconds;
  assert(Number.isFinite(meanSpeedKmS) && meanSpeedKmS > 0, `${label}: invalid route mean speed`);
  console.log(
    `${label}: ${(transferTimeSeconds / DAY_SECONDS).toFixed(2)} d, endpoint ${endpointErrorKm.toExponential(3)} km, mean ${meanSpeedKmS.toFixed(3)} km/s`,
  );
};

runCase("Earth to Mars", 1.523_679);
runCase("Earth to Jupiter", 5.202_887);
console.log("Orbital transfer checks passed");
