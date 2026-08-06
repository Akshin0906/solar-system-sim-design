import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  normalizeScenarioParamValue,
  normalizeScenarioTimeScale,
  SCENARIO_MAX_TIME_SCALE,
  SCENARIO_MIN_TIME_SCALE,
} from "../../src/scenarios/scenarioValidation";
import type { ScenarioParam } from "../../src/scenarios/types";

const params = [
  {
    key: "mass",
    label: "Mass",
    min: 0.5,
    max: 4,
    step: 0.5,
    default: 1,
  },
  {
    key: "target",
    label: "Target",
    default: 2,
    options: [
      { value: 2, label: "Earth" },
      { value: 3, label: "Mars" },
    ],
  },
] satisfies readonly ScenarioParam[];

describe("scenario parameter validation", () => {
  test("keeps finite range values and clamps both bounds", () => {
    assert.equal(normalizeScenarioParamValue(params, "mass", 2.5), 2.5);
    assert.equal(normalizeScenarioParamValue(params, "mass", -10), 0.5);
    assert.equal(normalizeScenarioParamValue(params, "mass", 10), 4);
  });

  test("rejects non-finite writes", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(normalizeScenarioParamValue(params, "mass", value), null);
      assert.equal(normalizeScenarioParamValue(params, "target", value), null);
    }
  });

  test("accepts registered choices and rejects unregistered values", () => {
    assert.equal(normalizeScenarioParamValue(params, "target", 2), 2);
    assert.equal(normalizeScenarioParamValue(params, "target", 3), 3);
    assert.equal(normalizeScenarioParamValue(params, "target", 2.5), null);
    assert.equal(normalizeScenarioParamValue(params, "target", 99), null);
  });

  test("rejects unknown parameter keys", () => {
    assert.equal(normalizeScenarioParamValue(params, "missing", 1), null);
  });
});

describe("scenario time-scale validation", () => {
  test("keeps finite values and clamps both supported bounds", () => {
    assert.equal(normalizeScenarioTimeScale(30), 30);
    assert.equal(normalizeScenarioTimeScale(0), SCENARIO_MIN_TIME_SCALE);
    assert.equal(normalizeScenarioTimeScale(10_000), SCENARIO_MAX_TIME_SCALE);
  });

  test("rejects non-finite values instead of changing the active scale", () => {
    assert.equal(normalizeScenarioTimeScale(Number.NaN), null);
    assert.equal(normalizeScenarioTimeScale(Number.POSITIVE_INFINITY), null);
    assert.equal(normalizeScenarioTimeScale(Number.NEGATIVE_INFINITY), null);
  });
});
