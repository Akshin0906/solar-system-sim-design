import { useScenarioStore } from "../scenarios/scenarioStore";
import { useSelectionStore, type CameraMode } from "./selectionStore";
import { useTimeStore } from "./timeStore";

// These user-chosen views are framed around a body (or one of its moving systems).
// Freeze motion before handing the camera a new target so damping can settle on a
// stable frame. Programmatic view changes deliberately keep using the raw selection
// store actions so shared links, Director stops, scenarios, and session restores keep
// ownership of their own clock semantics.
const PAUSING_CAMERA_MODES = new Set<CameraMode>([
  "focus",
  "follow",
  "earth-moon",
  "jupiter-system",
  "saturn-system",
  "moons",
  "observer",
]);

const RETARGETABLE_INSPECTION_MODES = new Set<CameraMode>([
  "focus",
  "follow",
  "moons",
  "observer",
]);

const pauseActiveMotion = () => {
  useTimeStore.getState().setPaused(true);

  // What-if scenarios own a separate T+ clock while the ordinary orbital clock is
  // already frozen. A manual inspection action must pause the clock that is actually
  // moving the scene, without affecting scenario-authored framing during startup.
  const scenario = useScenarioStore.getState();
  if (scenario.status === "running") {
    scenario.togglePause();
  }
};

export const activateCameraMode = (cameraMode: CameraMode) => {
  if (PAUSING_CAMERA_MODES.has(cameraMode)) {
    pauseActiveMotion();
  }
  useSelectionStore.getState().setCameraMode(cameraMode);
};

export const selectBodyFromInteraction = (selectedId: string) => {
  const selection = useSelectionStore.getState();
  if (RETARGETABLE_INSPECTION_MODES.has(selection.cameraMode)) {
    pauseActiveMotion();
  }
  selection.selectBody(selectedId);
};

export const goToBodyFromInteraction = (selectedId: string) => {
  pauseActiveMotion();
  useSelectionStore.getState().goToBody(selectedId);
};

export const focusBodyFromInteraction = (selectedId: string) => {
  pauseActiveMotion();
  useSelectionStore.getState().focusBody(selectedId);
};

export const followBodyFromInteraction = (selectedId: string) => {
  pauseActiveMotion();
  useSelectionStore.getState().followBody(selectedId);
};
