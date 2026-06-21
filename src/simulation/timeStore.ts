import { create } from "zustand";
import { DAY_MS, J2000_EPOCH, TIME_PRESETS, type TimePresetId } from "../data/constants";

type TimeState = {
  isPaused: boolean;
  simulationDateMs: number;
  timeScale: number;
  direction: 1 | -1;
  preset: TimePresetId | "custom";
  // While a doomsday scenario owns the view it freezes the J2000 clock and locks the
  // user transport so the date can't be scrubbed/stepped/un-paused out from under the
  // frozen base layer (which would desync the readout and snap to a different date on
  // exit). The scenario itself drives the clock via setPaused, which stays unlocked.
  transportLocked: boolean;
  setPaused: (isPaused: boolean) => void;
  togglePaused: () => void;
  tick: (elapsedRealSeconds: number) => void;
  stepDays: (days: number) => void;
  setDirection: (direction: 1 | -1) => void;
  setPreset: (preset: TimePresetId) => void;
  setTimeScale: (timeScale: number) => void;
  setSimulationDateMs: (simulationDateMs: number) => void;
  setTransportLocked: (transportLocked: boolean) => void;
};

const defaultPreset = TIME_PRESETS[2];
const j2000Ms = Date.parse(J2000_EPOCH);

export const SIMULATION_WINDOW_DAYS = 365.256 * 100;
export const MIN_TIME_SCALE = TIME_PRESETS[0].secondsPerSecond;
export const MAX_TIME_SCALE = TIME_PRESETS[TIME_PRESETS.length - 1].secondsPerSecond;
const MAX_TICK_REAL_SECONDS = 1 / 30;

const getDateMsFromEpochDaysValue = (days: number) => j2000Ms + days * DAY_MS;
const minSimulationDateMs = getDateMsFromEpochDaysValue(-SIMULATION_WINDOW_DAYS);
const maxSimulationDateMs = getDateMsFromEpochDaysValue(SIMULATION_WINDOW_DAYS);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const clampSimulationDateMs = (simulationDateMs: number) =>
  clamp(simulationDateMs, minSimulationDateMs, maxSimulationDateMs);
const clampTimeScale = (timeScale: number) => clamp(timeScale, MIN_TIME_SCALE, MAX_TIME_SCALE);

export const useTimeStore = create<TimeState>((set, get) => ({
  isPaused: false,
  simulationDateMs: Date.now(),
  timeScale: defaultPreset.secondsPerSecond,
  direction: 1,
  preset: defaultPreset.id,
  transportLocked: false,
  setPaused: (isPaused) => set({ isPaused }),
  togglePaused: () => set((state) => (state.transportLocked ? state : { isPaused: !state.isPaused })),
  tick: (elapsedRealSeconds) => {
    const { isPaused, direction, timeScale } = get();
    if (isPaused) {
      return;
    }

    const boundedElapsedSeconds = clamp(elapsedRealSeconds, 0, MAX_TICK_REAL_SECONDS);
    set((state) => ({
      simulationDateMs: clampSimulationDateMs(
        state.simulationDateMs + boundedElapsedSeconds * timeScale * 1_000 * direction,
      ),
    }));
  },
  stepDays: (days) => {
    // Respect the arrow-of-time direction so stepping stays consistent with playback
    // (tick() applies the same factor): in reverse mode the step controls also reverse.
    const { direction, transportLocked } = get();
    if (transportLocked) {
      return;
    }
    set((state) => ({
      simulationDateMs: clampSimulationDateMs(state.simulationDateMs + days * direction * DAY_MS),
    }));
  },
  setDirection: (direction) => set((state) => (state.transportLocked ? state : { direction })),
  setPreset: (preset) => {
    if (get().transportLocked) {
      return;
    }
    const match = TIME_PRESETS.find((item) => item.id === preset) ?? defaultPreset;
    set({ preset: match.id, timeScale: match.secondsPerSecond });
  },
  setTimeScale: (timeScale) => {
    if (get().transportLocked) {
      return;
    }
    const boundedTimeScale = clampTimeScale(timeScale);
    // Only show a preset label when the scale is genuinely at that preset (within
    // 1%); otherwise report "custom" so the dropdown never misrepresents the speed.
    const nearestPreset =
      boundedTimeScale < 1.5
        ? TIME_PRESETS[0]
        : TIME_PRESETS.find(
            (item) => Math.abs(item.secondsPerSecond - boundedTimeScale) <= item.secondsPerSecond * 0.01,
          );
    set({ timeScale: boundedTimeScale, preset: nearestPreset ? nearestPreset.id : "custom" });
  },
  setSimulationDateMs: (simulationDateMs) => {
    if (get().transportLocked) {
      return;
    }
    set({ simulationDateMs: clampSimulationDateMs(simulationDateMs) });
  },
  setTransportLocked: (transportLocked) => set({ transportLocked }),
}));

export const getDaysFromEpoch = (dateMs: number) => (dateMs - j2000Ms) / DAY_MS;

export const getDateMsFromEpochDays = (days: number) =>
  clampSimulationDateMs(getDateMsFromEpochDaysValue(days));
