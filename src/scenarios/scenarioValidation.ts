import type { ScenarioChoiceParam, ScenarioParam } from "./types";

// Scenario time-scale bounds (days/sec). The 120 days/sec ceiling consumes 80% of the
// integrator's fixed-step cap at a nominal 60 Hz, leaving capacity for ordinary render
// jitter before playback has to slow and surface throttling. The performance verifier
// guards this cross-module budget. Keeping the bounds beside the pure normalizer gives
// every caller the same validation contract without importing the Zustand store.
export const SCENARIO_MIN_TIME_SCALE = 1;
export const SCENARIO_MAX_TIME_SCALE = 120;

const isChoiceParam = (param: ScenarioParam): param is ScenarioChoiceParam =>
  Array.isArray(param.options);

export const normalizeScenarioParamValue = (
  params: readonly ScenarioParam[],
  key: string,
  value: number,
): number | null => {
  if (!Number.isFinite(value)) {
    return null;
  }

  const param = params.find((candidate) => candidate.key === key);
  if (!param) {
    return null;
  }

  if (isChoiceParam(param)) {
    return param.options.some((option) => option.value === value) ? value : null;
  }

  return Math.min(Math.max(value, param.min), param.max);
};

export const normalizeScenarioTimeScale = (daysPerSec: number): number | null => {
  if (!Number.isFinite(daysPerSec)) {
    return null;
  }

  return Math.min(Math.max(daysPerSec, SCENARIO_MIN_TIME_SCALE), SCENARIO_MAX_TIME_SCALE);
};
