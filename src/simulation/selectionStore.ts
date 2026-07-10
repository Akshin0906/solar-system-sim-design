import { create } from "zustand";
import type { Vec3 } from "./orbitalElements";

export type CameraMode =
  | "free"
  | "focus"
  | "follow"
  | "overview"
  | "inner"
  | "outer"
  | "earth-moon"
  | "jupiter-system"
  | "saturn-system"
  | "kuiper-belt"
  | "moons"
  | "observer"
  | "rocket-follow";

export type RocketCameraTarget = {
  position: Vec3;
  radius: number;
};

export type CameraPose = {
  position: Vec3;
  target: Vec3;
  up: Vec3;
};

export type CameraRestoreRequest = {
  revision: number;
  pose: CameraPose;
  expectedMode: CameraMode;
};

export type ViewSessionId = "experience" | "rocket" | "scenario";

type ViewSnapshot = {
  selectedId: string;
  cameraMode: CameraMode;
  rocketTarget: RocketCameraTarget | null;
  cameraPose: CameraPose | null;
};

type SelectionState = {
  selectedId: string;
  // Increments for every explicit body-selection request, including a repeated
  // selection of the current body. Mobile UI uses this to reopen a dismissed
  // inspector when the user taps the same body again.
  selectionRevision: number;
  cameraMode: CameraMode;
  rocketTarget: RocketCameraTarget | null;
  cameraRestoreRevision: number;
  cameraRestoreRequest: CameraRestoreRequest | null;
  viewSessions: Partial<Record<ViewSessionId, ViewSnapshot>>;
  setSelectedId: (selectedId: string) => void;
  selectBody: (selectedId: string) => void;
  goToBody: (selectedId: string) => void;
  setCameraMode: (cameraMode: CameraMode) => void;
  focusBody: (selectedId: string) => void;
  followBody: (selectedId: string) => void;
  followRocket: (position: Vec3, radius?: number) => void;
  updateRocketTarget: (position: Vec3, radius?: number) => void;
  clearRocketTarget: () => void;
  reportCameraPose: (pose: CameraPose) => void;
  restoreCameraPose: (pose: CameraPose, expectedMode?: CameraMode) => void;
  acknowledgeCameraRestore: (revision: number) => void;
  beginViewSession: (sessionId: ViewSessionId) => void;
  restoreViewSession: (sessionId: ViewSessionId) => void;
  resetRecommendedView: () => void;
};

const DEFAULT_ROCKET_FOCUS_RADIUS = 1.2;
const positionsMatch = (a: Vec3, b: Vec3) =>
  a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 0.000001);
const cloneVec3 = (value: Vec3): Vec3 => [value[0], value[1], value[2]];
const cloneCameraPose = (pose: CameraPose): CameraPose => ({
  position: cloneVec3(pose.position),
  target: cloneVec3(pose.target),
  up: cloneVec3(pose.up),
});
const cameraPosesMatch = (a: CameraPose, b: CameraPose) =>
  positionsMatch(a.position, b.position) && positionsMatch(a.target, b.target) && positionsMatch(a.up, b.up);
let latestCameraPose: CameraPose | null = null;

export const getLiveCameraPose = () =>
  latestCameraPose ? cloneCameraPose(latestCameraPose) : null;

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: "earth",
  selectionRevision: 0,
  cameraMode: "overview",
  rocketTarget: null,
  cameraRestoreRevision: 0,
  cameraRestoreRequest: null,
  viewSessions: {},
  setSelectedId: (selectedId) => set({ selectedId }),
  selectBody: (selectedId) =>
    set((state) => ({
      selectedId,
      selectionRevision: state.selectionRevision + 1,
    })),
  goToBody: (selectedId) =>
    set((state) => ({
      selectedId,
      selectionRevision: state.selectionRevision + 1,
      cameraMode: "focus",
      rocketTarget: null,
    })),
  setCameraMode: (cameraMode) =>
    set((state) => ({
      cameraMode,
      rocketTarget: cameraMode === "rocket-follow" ? state.rocketTarget : null,
    })),
  focusBody: (selectedId) =>
    set((state) => ({
      selectedId,
      selectionRevision: state.selectionRevision + 1,
      cameraMode: "focus",
      rocketTarget: null,
    })),
  followBody: (selectedId) =>
    set((state) => ({
      selectedId,
      selectionRevision: state.selectionRevision + 1,
      cameraMode: "follow",
      rocketTarget: null,
    })),
  followRocket: (position, radius = DEFAULT_ROCKET_FOCUS_RADIUS) =>
    set({ cameraMode: "rocket-follow", rocketTarget: { position, radius } }),
  updateRocketTarget: (position, radius = DEFAULT_ROCKET_FOCUS_RADIUS) =>
    set((state) => {
      if (state.cameraMode !== "rocket-follow") {
        return state.rocketTarget ? { rocketTarget: null } : {};
      }

      if (
        state.rocketTarget &&
        state.rocketTarget.radius === radius &&
        positionsMatch(state.rocketTarget.position, position)
      ) {
        return {};
      }

      return { rocketTarget: { position, radius } };
    }),
  clearRocketTarget: () =>
    set((state) => ({
      rocketTarget: null,
      cameraMode: state.cameraMode === "rocket-follow" ? "overview" : state.cameraMode,
    })),
  reportCameraPose: (pose) => {
    if (!latestCameraPose || !cameraPosesMatch(latestCameraPose, pose)) {
      latestCameraPose = cloneCameraPose(pose);
    }
  },
  restoreCameraPose: (pose, expectedMode) => {
    const restoredPose = cloneCameraPose(pose);
    latestCameraPose = restoredPose;
    set((state) => {
      const revision = state.cameraRestoreRevision + 1;
      return {
        cameraRestoreRevision: revision,
        cameraRestoreRequest: {
          revision,
          pose: restoredPose,
          expectedMode: expectedMode ?? state.cameraMode,
        },
      };
    });
  },
  acknowledgeCameraRestore: (revision) =>
    set((state) =>
      state.cameraRestoreRequest?.revision === revision
        ? { cameraRestoreRequest: null }
        : {}),
  beginViewSession: (sessionId) =>
    set((state) => {
      if (state.viewSessions[sessionId]) {
        return state;
      }

      return {
        viewSessions: {
          ...state.viewSessions,
          [sessionId]: {
            selectedId: state.selectedId,
            cameraMode: state.cameraMode,
            rocketTarget: state.rocketTarget
              ? { position: cloneVec3(state.rocketTarget.position), radius: state.rocketTarget.radius }
              : null,
            cameraPose: getLiveCameraPose(),
          },
        },
      };
    }),
  restoreViewSession: (sessionId) =>
    set((state) => {
      const snapshot = state.viewSessions[sessionId];
      if (!snapshot) {
        return state;
      }

      const viewSessions = { ...state.viewSessions };
      delete viewSessions[sessionId];
      const restoredPose = snapshot.cameraPose ? cloneCameraPose(snapshot.cameraPose) : null;
      if (restoredPose) {
        latestCameraPose = restoredPose;
      }
      const revision = restoredPose ? state.cameraRestoreRevision + 1 : state.cameraRestoreRevision;
      return {
        selectedId: snapshot.selectedId,
        cameraMode: snapshot.cameraMode,
        rocketTarget: snapshot.rocketTarget
          ? { position: cloneVec3(snapshot.rocketTarget.position), radius: snapshot.rocketTarget.radius }
          : null,
        cameraRestoreRevision: revision,
        cameraRestoreRequest: restoredPose
          ? {
              revision,
              pose: restoredPose,
              expectedMode: snapshot.cameraMode,
            }
          : state.cameraRestoreRequest,
        selectionRevision: state.selectionRevision + 1,
        viewSessions,
      };
    }),
  resetRecommendedView: () =>
    set((state) => ({
      selectedId: "earth",
      selectionRevision: state.selectionRevision + 1,
      cameraMode: "overview",
      rocketTarget: null,
      cameraRestoreRequest: null,
      viewSessions: {},
    })),
}));
