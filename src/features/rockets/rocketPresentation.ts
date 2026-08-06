import type { Vec3 } from "../../simulation/orbitalElements";
import type {
  RocketArrivalMode,
  RocketLaunchMode,
  RocketMissionMode,
} from "./missionOptions";
import type { TransferEstimate } from "./transferModel";

export type MissionStatus =
  | "pre-launch"
  | "burn"
  | "coast"
  | "transfer"
  | "approach"
  | "arrived"
  | "flyby"
  | "missed";

export const missionStatusLabel: Record<MissionStatus, string> = {
  "pre-launch": "Pre-launch",
  burn: "Burn",
  coast: "Coast",
  transfer: "Transfer",
  approach: "Approach",
  arrived: "Arrived",
  flyby: "Flyby complete",
  missed: "Missed target",
};

export type RocketDestinationView = {
  bodyId: string;
  label: string;
  distanceToTargetKm: number;
  etaSeconds: number | null;
  closestApproachKm: number;
  destScenePosition: Vec3;
  destSceneRadius: number;
};

export type RocketTransferView = {
  estimate: TransferEstimate;
  arcScenePoints: Vec3[];
  progress: number;
  arcLengthKm: number;
  interceptScenePosition: Vec3;
  targetArrivalScenePosition: Vec3;
  continuationScenePoints: Vec3[];
  captureAvailable: boolean;
  captureApplied: boolean;
};

export type RocketView = {
  elapsedSeconds: number;
  speedKmS: number;
  distanceTraveledKm: number;
  distanceFromEarthKm: number;
  status: MissionStatus;
  missionMode: RocketMissionMode;
  launchMode: RocketLaunchMode;
  arrivalMode: RocketArrivalMode;
  scenePosition: Vec3;
  launchScenePosition: Vec3;
  sceneDirection: Vec3;
  directScenePoints: Vec3[] | null;
  destination: RocketDestinationView | null;
  transfer: RocketTransferView | null;
};

export const formatMissionTime = (seconds: number): string => {
  if (seconds < 1) {
    return "0s";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3_600) {
    const minutes = Math.floor(seconds / 60);
    const remSeconds = Math.floor(seconds % 60);
    return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3_600);
    const remMinutes = Math.floor((seconds % 3_600) / 60);
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }
  if (seconds < 31_557_600) {
    const days = Math.floor(seconds / 86_400);
    const remHours = Math.floor((seconds % 86_400) / 3_600);
    return remHours ? `${days}d ${remHours}h` : `${days}d`;
  }
  const years = seconds / 31_557_600;
  return `${years.toFixed(years < 10 ? 2 : 1)} yr`;
};

const SPEED_OF_LIGHT_KM_S = 299_792.458;

export const formatSpeed = (speedKmS: number): string => {
  if (speedKmS >= 1_000) {
    const fractionC = speedKmS / SPEED_OF_LIGHT_KM_S;
    return `${Math.round(speedKmS).toLocaleString()} km/s · ${(fractionC * 100).toFixed(1)}% c`;
  }
  return `${speedKmS.toFixed(speedKmS >= 10 ? 1 : 2)} km/s`;
};

export const formatDeltaV = (deltaVKmS: number | null): string => {
  if (deltaVKmS === null) {
    return "--";
  }
  return `${deltaVKmS.toFixed(deltaVKmS >= 10 ? 1 : 2)} km/s`;
};

export const formatPhaseAngle = (degrees: number): string =>
  `${degrees >= 0 ? "+" : ""}${degrees.toFixed(1)}°`;
