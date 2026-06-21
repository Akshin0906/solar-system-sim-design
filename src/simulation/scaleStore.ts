import { create } from "zustand";
import { readJsonPreference, writeJsonPreference } from "../ui/safeStorage";
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

// View settings persist across reloads (a personal-use tool the owner returns to), so a
// chosen scale, label density, and overlay toggles aren't reset to defaults every visit.
// Time state is intentionally NOT persisted — the clock should default to "now" on load.
const STORAGE_KEY = "solar-system-sim.view";

type PersistedView = Pick<ScaleState, "mode" | "labelDensity" | "showGrid" | "showOrbits" | "showTrails">;

const SCALE_MODES: ScaleMode[] = ["real", "readable", "compressed", "overview"];
const LABEL_DENSITIES: LabelDensity[] = ["minimal", "standard", "full"];

const defaults: PersistedView = {
  mode: "compressed",
  labelDensity: "standard",
  showGrid: false,
  showOrbits: true,
  showTrails: false,
};

// Validate every field so a malformed/old payload can never feed an invalid enum into
// the renderer; any unrecognized value silently falls back to its default.
const loadPersistedView = (): PersistedView => {
  const stored = readJsonPreference<Partial<PersistedView>>(STORAGE_KEY);
  if (!stored) {
    return defaults;
  }

  return {
    mode: SCALE_MODES.includes(stored.mode as ScaleMode) ? (stored.mode as ScaleMode) : defaults.mode,
    labelDensity: LABEL_DENSITIES.includes(stored.labelDensity as LabelDensity)
      ? (stored.labelDensity as LabelDensity)
      : defaults.labelDensity,
    showGrid: typeof stored.showGrid === "boolean" ? stored.showGrid : defaults.showGrid,
    showOrbits: typeof stored.showOrbits === "boolean" ? stored.showOrbits : defaults.showOrbits,
    showTrails: typeof stored.showTrails === "boolean" ? stored.showTrails : defaults.showTrails,
  };
};

export const useScaleStore = create<ScaleState>((set) => ({
  ...loadPersistedView(),
  setMode: (mode) => set({ mode }),
  setLabelDensity: (labelDensity) => set({ labelDensity }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowOrbits: (showOrbits) => set({ showOrbits }),
  setShowTrails: (showTrails) => set({ showTrails }),
}));

// Persist the view slice on any change (best-effort; blocked storage is a no-op).
useScaleStore.subscribe((state) => {
  writeJsonPreference(STORAGE_KEY, {
    mode: state.mode,
    labelDensity: state.labelDensity,
    showGrid: state.showGrid,
    showOrbits: state.showOrbits,
    showTrails: state.showTrails,
  } satisfies PersistedView);
});
