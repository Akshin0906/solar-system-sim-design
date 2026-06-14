import { create } from "zustand";
import type { LabelDensity, ScaleMode } from "./units";

type ScaleState = {
  mode: ScaleMode;
  labelDensity: LabelDensity;
  showGrid: boolean;
  showOrbits: boolean;
  showTrails: boolean;
  setMode: (mode: ScaleMode) => void;
  setLabelDensity: (density: LabelDensity) => void;
  setShowGrid: (showGrid: boolean) => void;
  setShowOrbits: (showOrbits: boolean) => void;
  setShowTrails: (showTrails: boolean) => void;
};

export const useScaleStore = create<ScaleState>((set) => ({
  mode: "compressed",
  labelDensity: "standard",
  showGrid: true,
  showOrbits: true,
  showTrails: false,
  setMode: (mode) => set({ mode }),
  setLabelDensity: (labelDensity) => set({ labelDensity }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowOrbits: (showOrbits) => set({ showOrbits }),
  setShowTrails: (showTrails) => set({ showTrails }),
}));
