import { bodiesById } from "../../data";
import { useScaleStore } from "../../simulation/scaleStore";
import {
  useSelectionStore,
  getLiveCameraPose,
  type CameraMode,
  type CameraPose,
} from "../../simulation/selectionStore";
import { useTimeStore } from "../../simulation/timeStore";
import type { Vec3 } from "../../simulation/orbitalElements";
import type { LabelDensity, ScaleMode } from "../../simulation/units";

const SHARE_VERSION = "1";
const CAMERA_MODES: CameraMode[] = [
  "free",
  "focus",
  "follow",
  "overview",
  "inner",
  "outer",
  "earth-moon",
  "jupiter-system",
  "saturn-system",
  "kuiper-belt",
  "moons",
  "observer",
];
const SCALE_MODES: ScaleMode[] = ["real", "readable", "compressed", "overview"];
const LABEL_DENSITIES: LabelDensity[] = ["off", "minimal", "standard", "full"];
const MAX_SHARED_POSE_COORDINATE = 10_000;
const MIN_SHARED_POSE_VECTOR_LENGTH = 0.000001;

export type SharedViewState = {
  bodyId: string;
  cameraMode: CameraMode;
  scaleMode: ScaleMode;
  simulationDateMs: number;
  isPaused: boolean;
  direction: 1 | -1;
  timeScale: number;
  labelDensity: LabelDensity;
  showGrid: boolean;
  showOrbits: boolean;
  showTrails: boolean;
  cameraPose: CameraPose | null;
};

const booleanParam = (value: string | null, fallback: boolean) =>
  value === "1" ? true : value === "0" ? false : fallback;

const clonePose = (pose: CameraPose): CameraPose => ({
  position: [...pose.position] as Vec3,
  target: [...pose.target] as Vec3,
  up: [...pose.up] as Vec3,
});

const encodeVec3 = (value: Vec3) => value.join(",");

const decodeVec3 = (value: string | null): Vec3 | null => {
  const parts = value?.split(",");
  if (!parts || parts.length !== 3) {
    return null;
  }
  const parsed = parts.map(Number);
  if (parsed.some((coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > MAX_SHARED_POSE_COORDINATE)) {
    return null;
  }
  return [parsed[0], parsed[1], parsed[2]];
};

const vectorLength = (value: Vec3) => Math.hypot(value[0], value[1], value[2]);
const normalizeVec3 = (value: Vec3): Vec3 | null => {
  const length = vectorLength(value);
  return length >= MIN_SHARED_POSE_VECTOR_LENGTH
    ? [value[0] / length, value[1] / length, value[2] / length]
    : null;
};
const validCameraPose = (position: Vec3 | null, target: Vec3 | null, up: Vec3 | null): CameraPose | null => {
  if (!position || !target || !up) {
    return null;
  }
  const viewOffset: Vec3 = [
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ];
  const normalizedUp = normalizeVec3(up);
  return normalizedUp && vectorLength(viewOffset) >= MIN_SHARED_POSE_VECTOR_LENGTH
    ? { position, target, up: normalizedUp }
    : null;
};

export const captureSharedViewState = (): SharedViewState => {
  const selection = useSelectionStore.getState();
  const cameraPose = getLiveCameraPose();
  const scale = useScaleStore.getState();
  const time = useTimeStore.getState();
  return {
    bodyId: bodiesById.has(selection.selectedId) ? selection.selectedId : "earth",
    cameraMode: CAMERA_MODES.includes(selection.cameraMode) ? selection.cameraMode : "overview",
    scaleMode: scale.mode,
    simulationDateMs: time.simulationDateMs,
    isPaused: time.isPaused,
    direction: time.direction,
    timeScale: time.timeScale,
    labelDensity: scale.labelDensity,
    showGrid: scale.showGrid,
    showOrbits: scale.showOrbits,
    showTrails: scale.showTrails,
    cameraPose:
      selection.cameraMode === "free" && cameraPose
        ? clonePose(cameraPose)
        : null,
  };
};

export const encodeSharedViewState = (state: SharedViewState) => {
  const params = new URLSearchParams();
  params.set("view", SHARE_VERSION);
  params.set("body", state.bodyId);
  params.set("camera", state.cameraMode);
  params.set("scale", state.scaleMode);
  params.set("date", String(Math.round(state.simulationDateMs)));
  params.set("paused", state.isPaused ? "1" : "0");
  params.set("dir", String(state.direction));
  params.set("speed", String(state.timeScale));
  params.set("labels", state.labelDensity);
  params.set("grid", state.showGrid ? "1" : "0");
  params.set("orbits", state.showOrbits ? "1" : "0");
  params.set("trails", state.showTrails ? "1" : "0");
  if (state.cameraMode === "free" && state.cameraPose) {
    params.set("cp", encodeVec3(state.cameraPose.position));
    params.set("ct", encodeVec3(state.cameraPose.target));
    params.set("cu", encodeVec3(state.cameraPose.up));
  }
  return params.toString();
};

export const decodeSharedViewState = (search: string): SharedViewState | null => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("view") !== SHARE_VERSION) {
    return null;
  }

  const fallback = captureSharedViewState();
  const bodyId = params.get("body") ?? fallback.bodyId;
  const cameraMode = params.get("camera") as CameraMode | null;
  const scaleMode = params.get("scale") as ScaleMode | null;
  const labelDensity = params.get("labels") as LabelDensity | null;
  const dateParam = params.get("date");
  const simulationDateMs = dateParam === null ? Number.NaN : Number(dateParam);
  const direction = Number(params.get("dir"));
  const timeScale = Number(params.get("speed"));
  const resolvedCameraMode = cameraMode && CAMERA_MODES.includes(cameraMode) ? cameraMode : fallback.cameraMode;
  const position = decodeVec3(params.get("cp"));
  const target = decodeVec3(params.get("ct"));
  const up = decodeVec3(params.get("cu"));
  const cameraPose = validCameraPose(position, target, up);

  return {
    bodyId: bodiesById.has(bodyId) ? bodyId : fallback.bodyId,
    cameraMode: resolvedCameraMode,
    scaleMode: scaleMode && SCALE_MODES.includes(scaleMode) ? scaleMode : fallback.scaleMode,
    simulationDateMs: Number.isFinite(simulationDateMs) ? simulationDateMs : fallback.simulationDateMs,
    isPaused: booleanParam(params.get("paused"), fallback.isPaused),
    direction: direction === -1 ? -1 : 1,
    timeScale: Number.isFinite(timeScale) && timeScale > 0 ? timeScale : fallback.timeScale,
    labelDensity:
      labelDensity && LABEL_DENSITIES.includes(labelDensity) ? labelDensity : fallback.labelDensity,
    showGrid: booleanParam(params.get("grid"), fallback.showGrid),
    showOrbits: booleanParam(params.get("orbits"), fallback.showOrbits),
    showTrails: booleanParam(params.get("trails"), fallback.showTrails),
    cameraPose:
      resolvedCameraMode === "free" && cameraPose
        ? cameraPose
        : null,
  };
};

export const applySharedViewState = (state: SharedViewState) => {
  const time = useTimeStore.getState();
  time.setSimulationDateMs(state.simulationDateMs);
  time.setTimeScale(state.timeScale);
  time.setDirection(state.direction);
  time.setPaused(state.isPaused);

  const scale = useScaleStore.getState();
  scale.setMode(state.scaleMode);
  scale.setLabelDensity(state.labelDensity);
  scale.setShowGrid(state.showGrid);
  scale.setShowOrbits(state.showOrbits);
  scale.setShowTrails(state.showTrails);

  const selection = useSelectionStore.getState();
  selection.selectBody(state.bodyId);
  selection.setCameraMode(state.cameraMode);
  if (state.cameraMode === "free" && state.cameraPose) {
    selection.restoreCameraPose(state.cameraPose, "free");
  }
};

export const applySharedViewFromLocation = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const state = decodeSharedViewState(window.location.search);
  if (!state) {
    return false;
  }
  applySharedViewState(state);
  return true;
};

export const createSharedViewUrl = (baseUrl: string, state = captureSharedViewState()) => {
  const url = new URL(baseUrl);
  url.search = encodeSharedViewState(state);
  url.hash = "";
  return url.toString();
};
