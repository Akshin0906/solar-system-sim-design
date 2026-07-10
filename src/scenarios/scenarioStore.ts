import { create } from "zustand";
import { bodiesById } from "../data";
import { useExperienceStore } from "../features/experiences/experienceStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { defaultParamsFor, impactTargetId, scenarioById } from "./registry";
import type { SimEvent } from "./types";

export type ScenarioStatus = "idle" | "running" | "paused";

// Scenario time-scale bounds (days/sec). Exported so the panel slider and the store
// agree, and so a programmatic setTimeScale can't push the integrator off-scale.
export const SCENARIO_MIN_TIME_SCALE = 1;
export const SCENARIO_MAX_TIME_SCALE = 300;

// The J2000 clock's paused state and date from before a scenario took over, so we can
// restore exactly how the user left it on exit (a scenario freezes the real clock so the
// date readout doesn't drift while its own T+ clock runs). Kept outside reactive state.
let priorClockPaused = false;
let frozenSimulationDateMs = 0;

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
  // Live runtime status surfaced in the panel. fragmentCapHit > 0 means debris was
  // coalesced into the largest shards (never silently dropped); throttled means sim-time
  // could not keep up with the requested scale this frame.
  fragmentCapHit: number;
  liveFragmentCount: number;
  throttled: boolean;
  latestEvent: SimEvent | null;
  start: (scenarioId: string) => void;
  stop: () => void;
  togglePause: () => void;
  setParam: (key: string, value: number) => void;
  setTimeScale: (daysPerSec: number) => void;
  // Frame-loop bridges (not for UI use):
  reportRuntime: (status: {
    elapsedSimSeconds: number;
    fragmentCapHit: number;
    liveFragmentCount: number;
    throttled: boolean;
  }) => void;
  reportConsumed: (ids: string[]) => void;
  reportEvent: (event: SimEvent | null) => void;
};

const frameScenarioAction = (scenarioId: string, params: Record<string, number>) => {
  const selection = useSelectionStore.getState();

  if (scenarioId === "impact" || scenarioId === "collision") {
    selection.goToBody(impactTargetId(params.target ?? 2, bodiesById));
    return;
  }

  if (scenarioId === "red-giant") {
    selection.selectBody("sun");
    selection.setCameraMode("inner");
    return;
  }

  selection.setCameraMode("overview");
};

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  activeScenarioId: null,
  instanceId: 0,
  status: "idle",
  params: {},
  timeScaleDaysPerSec: 30,
  elapsedSimSeconds: 0,
  consumedIds: [],
  fragmentCapHit: 0,
  liveFragmentCount: 0,
  throttled: false,
  latestEvent: null,

  start: (scenarioId) => {
    const scenario = scenarioById.get(scenarioId);
    if (!scenario) {
      return;
    }
    // A scenario owns both the view and a frozen base clock. Restore any Director
    // session before capturing the scenario snapshot so exit returns to the user's
    // actual pre-tour state rather than to a transient authored stop.
    useExperienceStore.getState().stop();
    const replacingActiveScenario = get().activeScenarioId !== null;
    if (!replacingActiveScenario) {
      priorClockPaused = useTimeStore.getState().isPaused;
      frozenSimulationDateMs = useTimeStore.getState().simulationDateMs;
      useSelectionStore.getState().beginViewSession("scenario");
    }
    useTimeStore.getState().setPaused(true);
    // Lock the J2000 transport so the user can't scrub/step/un-pause the frozen clock out
    // from under the scenario's frozen base layer (which would desync the date readout and
    // snap to a different date on exit).
    useTimeStore.getState().setTransportLocked(true);
    // The rocket marker is hidden while a scenario runs; release a rocket-follow camera so
    // it doesn't get stuck tracking a now-hidden rocket.
    useSelectionStore.getState().clearRocketTarget();
    const params = defaultParamsFor(scenarioId);
    set((state) => ({
      activeScenarioId: scenarioId,
      instanceId: state.instanceId + 1,
      status: "running",
      params,
      timeScaleDaysPerSec: scenario.defaultTimeScaleDaysPerSec,
      elapsedSimSeconds: 0,
      consumedIds: [],
      fragmentCapHit: 0,
      liveFragmentCount: 0,
      throttled: false,
      latestEvent: null,
    }));
    frameScenarioAction(scenarioId, params);
  },

  stop: () => {
    if (get().activeScenarioId === null) {
      return;
    }
    // Unlock first — setSimulationDateMs is itself gated by the lock — then restore the
    // exact date the scenario froze at (a backstop in case anything slipped the freeze)
    // and the prior paused state, so exit is always consistent.
    useTimeStore.getState().setTransportLocked(false);
    useTimeStore.getState().setSimulationDateMs(frozenSimulationDateMs);
    useTimeStore.getState().setPaused(priorClockPaused);
    useSelectionStore.getState().restoreViewSession("scenario");
    set((state) => ({
      activeScenarioId: null,
      instanceId: state.instanceId + 1,
      status: "idle",
      elapsedSimSeconds: 0,
      consumedIds: [],
      fragmentCapHit: 0,
      liveFragmentCount: 0,
      throttled: false,
      latestEvent: null,
    }));
  },

  togglePause: () =>
    set((state) => {
      if (state.status !== "running" && state.status !== "paused") {
        return state;
      }
      return { status: state.status === "running" ? "paused" : "running" };
    }),

  setParam: (key, value) => {
    const activeScenarioId = get().activeScenarioId;
    if (!activeScenarioId) {
      return;
    }
    // A param edit re-seeds from T+0 (instanceId bump) so the new initial condition
    // is shown immediately — the sandbox half of "watch and play".
    set((state) => ({
      params: { ...state.params, [key]: value },
      instanceId: state.instanceId + 1,
      elapsedSimSeconds: 0,
      consumedIds: [],
      fragmentCapHit: 0,
      liveFragmentCount: 0,
      throttled: false,
      latestEvent: null,
    }));

    if (key === "target" && (activeScenarioId === "impact" || activeScenarioId === "collision")) {
      frameScenarioAction(activeScenarioId, get().params);
    }
  },

  setTimeScale: (daysPerSec) =>
    set({
      timeScaleDaysPerSec: Math.min(Math.max(daysPerSec, SCENARIO_MIN_TIME_SCALE), SCENARIO_MAX_TIME_SCALE),
    }),

  // Bail when unchanged (returning the same state ref skips the zustand notify) so a
  // paused scenario doesn't fire a subscriber notification every throttle tick.
  reportRuntime: ({ elapsedSimSeconds, fragmentCapHit, liveFragmentCount, throttled }) =>
    set((state) =>
      state.elapsedSimSeconds === elapsedSimSeconds &&
      state.fragmentCapHit === fragmentCapHit &&
      state.liveFragmentCount === liveFragmentCount &&
      state.throttled === throttled
        ? state
        : { elapsedSimSeconds, fragmentCapHit, liveFragmentCount, throttled }),

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
  reportEvent: (latestEvent) => set({ latestEvent }),
}));
