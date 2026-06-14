import { create } from "zustand";

export type CameraMode = "free" | "focus" | "follow" | "overview" | "inner" | "outer" | "moons";

type SelectionState = {
  selectedId: string;
  cameraMode: CameraMode;
  setSelectedId: (selectedId: string) => void;
  setCameraMode: (cameraMode: CameraMode) => void;
  focusBody: (selectedId: string) => void;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: "earth",
  cameraMode: "overview",
  setSelectedId: (selectedId) => set({ selectedId }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  focusBody: (selectedId) => set({ selectedId, cameraMode: "focus" }),
}));
