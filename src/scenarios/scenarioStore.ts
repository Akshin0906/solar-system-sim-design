import { create } from "zustand";
import { useTimeStore } from "../simulation/timeStore";
import { defaultParamsFor, scenarioById } from "./registry";

export type ScenarioStatus = "idle" | "running" | "paused";

// The J2000 clock's paused state from before a scenario took over, so we can restore
// exactly how the user left it on exit (a scenario freezes the real clock so the date
// readout doesn't drift while its own T+ clock runs). Kept outside reactive state.
let priorClockPaused = false;

type ScenarioState = {
  activeScenarioId: string | null;
  // Bumped on every (re)start and every param edit. The frame loop watches this to
  // know when to (re)seed the integrator — so editing a slider re-runs from T+0.
  instanceId: number;
  status: ScenarioStatus;
  params: Record<string, number>;
  timeScaleDaysPerSec: number;
  elapsedSimSeconds: number;
  // Data-body ids the catastrophe has destroyed; the scene stops drawing them.
  consumedIds: string[];
  start: (scenarioId: string) => void;
  stop: () => void;
  togglePause: () => void;
  setParam: (key: string, value: number) => void;
  setTimeScale: (daysPerSec: number) => void;
  // Frame-loop bridges (not for UI use):
  reportElapsed: (seconds: number) => void;
  reportConsumed: (ids: string[]) => void;
};

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  activeScenarioId: null,
  instanceId: 0,
  status: "idle",
  params: {},
  timeScaleDaysPerSec: 30,
  elapsedSimSeconds: 0,
  consumedIds: [],

  start: (scenarioId) => {
    const scenario = scenarioById.get(scenarioId);
    if (!scenario) {
      return;
    }
    priorClockPaused = useTimeStore.getState().isPaused;
    useTimeStore.getState().setPaused(true);
    set((state) => ({
      activeScenarioId: scenarioId,
      instanceId: state.instanceId + 1,
      status: "running",
      params: defaultParamsFor(scenarioId),
      timeScaleDaysPerSec: scenario.defaultTimeScaleDaysPerSec,
      elapsedSimSeconds: 0,
      consumedIds: [],
    }));
  },

  stop: () => {
    useTimeStore.getState().setPaused(priorClockPaused);
    set((state) => ({
      activeScenarioId: null,
      instanceId: state.instanceId + 1,
      status: "idle",
      elapsedSimSeconds: 0,
      consumedIds: [],
    }));
  },

  togglePause: () =>
    set((state) => {
      if (state.status !== "running" && state.status !== "paused") {
        return state;
      }
      return { status: state.status === "running" ? "paused" : "running" };
    }),

  setParam: (key, value) =>
    set((state) => {
      if (!state.activeScenarioId) {
        return state;
      }
      // A param edit re-seeds from T+0 (instanceId bump) so the new initial condition
      // is shown immediately — the sandbox half of "watch and play".
      return {
        params: { ...state.params, [key]: value },
        instanceId: state.instanceId + 1,
        elapsedSimSeconds: 0,
        consumedIds: [],
      };
    }),

  setTimeScale: (daysPerSec) => set({ timeScaleDaysPerSec: daysPerSec }),

  // Bail when unchanged (returning the same state ref skips the zustand notify) so a
  // paused scenario doesn't fire a subscriber notification every throttle tick.
  reportElapsed: (seconds) =>
    set((state) => (state.elapsedSimSeconds === seconds ? state : { elapsedSimSeconds: seconds })),

  reportConsumed: (ids) =>
    set((state) => {
      const merged = new Set(state.consumedIds);
      let changed = false;
      for (const id of ids) {
        if (!merged.has(id)) {
          merged.add(id);
          changed = true;
        }
      }
      return changed ? { consumedIds: [...merged] } : state;
    }),
}));
