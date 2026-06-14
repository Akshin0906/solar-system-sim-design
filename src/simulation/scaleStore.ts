import { create } from "zustand";
import type { LabelDensity, ScaleMode } from "./units";

type ScaleState = {
  mode: ScaleMode;
  labelDensity: LabelDensity;
  showOrbits: boolean;
  showTrails: boolean;
  setMode: (mode: ScaleMode) => void;
  setLabelDensity: (density: LabelDensity) => void;
  setShowOrbits: (showOrbits: boolean) => void;
  setShowTrails: (showTrails: boolean) => void;
};

export const useScaleStore = create<ScaleState>((set) => ({
  mode: "compressed",
  labelDensity: "standard",
  showOrbits: true,
  showTrails: false,
  setMode: (mode) => set({ mode }),
  setLabelDensity: (labelDensity) => set({ labelDensity }),
  setShowOrbits: (showOrbits) => set({ showOrbits }),
  setShowTrails: (showTrails) => set({ showTrails }),
}));
