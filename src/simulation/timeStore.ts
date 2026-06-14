import { create } from "zustand";
import { DAY_MS, J2000_EPOCH, TIME_PRESETS, type TimePresetId } from "../data/constants";

type TimeState = {
  isPaused: boolean;
  simulationDateMs: number;
  timeScale: number;
  direction: 1 | -1;
  preset: TimePresetId | "custom";
  setPaused: (isPaused: boolean) => void;
  togglePaused: () => void;
  tick: (elapsedRealSeconds: number) => void;
  stepDays: (days: number) => void;
  setDirection: (direction: 1 | -1) => void;
  setPreset: (preset: TimePresetId) => void;
  setTimeScale: (timeScale: number) => void;
  setSimulationDateMs: (simulationDateMs: number) => void;
};

const defaultPreset = TIME_PRESETS[2];

export const useTimeStore = create<TimeState>((set, get) => ({
  isPaused: false,
  simulationDateMs: Date.now(),
  timeScale: defaultPreset.secondsPerSecond,
  direction: 1,
  preset: defaultPreset.id,
  setPaused: (isPaused) => set({ isPaused }),
  togglePaused: () => set((state) => ({ isPaused: !state.isPaused })),
  tick: (elapsedRealSeconds) => {
    const { isPaused, direction, timeScale } = get();
    if (isPaused) {
      return;
    }

    set((state) => ({
      simulationDateMs: state.simulationDateMs + elapsedRealSeconds * timeScale * 1_000 * direction,
    }));
  },
  stepDays: (days) =>
    set((state) => ({
      simulationDateMs: state.simulationDateMs + days * DAY_MS,
    })),
  setDirection: (direction) => set({ direction }),
  setPreset: (preset) => {
    const match = TIME_PRESETS.find((item) => item.id === preset) ?? defaultPreset;
    set({ preset: match.id, timeScale: match.secondsPerSecond });
  },
  setTimeScale: (timeScale) => {
    // Only show a preset label when the scale is genuinely at that preset (within
    // 1%); otherwise report "custom" so the dropdown never misrepresents the speed.
    const nearestPreset = TIME_PRESETS.find(
      (item) => Math.abs(item.secondsPerSecond - timeScale) <= item.secondsPerSecond * 0.01,
    );
    set({ timeScale, preset: nearestPreset ? nearestPreset.id : "custom" });
  },
  setSimulationDateMs: (simulationDateMs) => set({ simulationDateMs }),
}));

export const getDaysFromEpoch = (dateMs: number) => (dateMs - Date.parse(J2000_EPOCH)) / DAY_MS;

export const getDateMsFromEpochDays = (days: number) => Date.parse(J2000_EPOCH) + days * DAY_MS;
