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
  | "rocket-follow";

type RocketCameraTarget = {
  position: Vec3;
  radius: number;
};

type SelectionState = {
  selectedId: string;
  // Increments for every explicit body-selection request, including a repeated
  // selection of the current body. Mobile UI uses this to reopen a dismissed
  // inspector when the user taps the same body again.
  selectionRevision: number;
  cameraMode: CameraMode;
  rocketTarget: RocketCameraTarget | null;
  setSelectedId: (selectedId: string) => void;
  selectBody: (selectedId: string) => void;
  setCameraMode: (cameraMode: CameraMode) => void;
  focusBody: (selectedId: string) => void;
  followRocket: (position: Vec3, radius?: number) => void;
  updateRocketTarget: (position: Vec3, radius?: number) => void;
  clearRocketTarget: () => void;
};

const DEFAULT_ROCKET_FOCUS_RADIUS = 1.2;
const positionsMatch = (a: Vec3, b: Vec3) =>
  a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 0.000001);

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: "earth",
  selectionRevision: 0,
  cameraMode: "overview",
  rocketTarget: null,
  setSelectedId: (selectedId) => set({ selectedId, rocketTarget: null }),
  selectBody: (selectedId) =>
    set((state) => ({
      selectedId,
      selectionRevision: state.selectionRevision + 1,
      rocketTarget: null,
    })),
  setCameraMode: (cameraMode) =>
    set((state) => ({
      cameraMode,
      rocketTarget: cameraMode === "rocket-follow" ? state.rocketTarget : null,
    })),
  focusBody: (selectedId) => set({ selectedId, cameraMode: "focus", rocketTarget: null }),
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
}));
