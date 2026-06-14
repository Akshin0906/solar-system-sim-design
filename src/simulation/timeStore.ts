import { create } from "zustand";
import { DAY_MS, J2000_EPOCH, TIME_PRESETS, type TimePresetId } from "../data/constants";

type TimeState = {
  isPaused: boolean;
  simulationDateMs: number;
  timeScale: number;
  direction: 1 | -1;
  preset: TimePresetId;
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
    const nearestPreset =
      TIME_PRESETS.find((item) => Math.abs(item.secondsPerSecond - timeScale) < 1) ?? undefined;
    set({ timeScale, preset: nearestPreset?.id ?? "day" });
  },
  setSimulationDateMs: (simulationDateMs) => set({ simulationDateMs }),
}));

export const getDaysFromEpoch = (dateMs: number) => (dateMs - Date.parse(J2000_EPOCH)) / DAY_MS;

export const getDateMsFromEpochDays = (days: number) => Date.parse(J2000_EPOCH) + days * DAY_MS;
