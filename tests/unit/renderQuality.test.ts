import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clampRenderQuality,
  combinedRenderQuality,
  createSphereLodGeometries,
  getSharedSphereLodGeometries,
  performanceFactorToRenderQuality,
  projectedSphereRadiusPx,
  resolveSphereLod,
  useRenderQualityStore,
} from "../../src/scene/renderQuality";

describe("render-quality factors", () => {
  test("clamps measured and combined quality conservatively", () => {
    assert.equal(clampRenderQuality(Number.NaN), 0.5);
    assert.equal(clampRenderQuality(Number.POSITIVE_INFINITY), 0.5);
    assert.equal(clampRenderQuality(0.1), 0.5);
    assert.equal(clampRenderQuality(0.8), 0.8);
    assert.equal(clampRenderQuality(2), 1);
    assert.equal(combinedRenderQuality(0.9, 0.7), 0.7);
    assert.equal(combinedRenderQuality(Number.NaN, 1), 0.5);
    assert.equal(performanceFactorToRenderQuality(0), 0.5);
    assert.equal(performanceFactorToRenderQuality(0.5), 0.75);
    assert.equal(performanceFactorToRenderQuality(1), 1);
    assert.equal(performanceFactorToRenderQuality(-1), 0.5);
    assert.equal(performanceFactorToRenderQuality(2), 1);
    assert.equal(performanceFactorToRenderQuality(Number.NaN), 0.5);
  });

  test("stores only normalized measured quality", () => {
    useRenderQualityStore.getState().setMeasuredFactor(0.75);
    assert.equal(useRenderQualityStore.getState().measuredFactor, 0.75);
    useRenderQualityStore.getState().setMeasuredFactor(Number.NaN);
    assert.equal(useRenderQualityStore.getState().measuredFactor, 0.5);
  });
});

describe("projected sphere size", () => {
  test("matches the production perspective projection", () => {
    const nearRadius = projectedSphereRadiusPx(1, 10, 60, 1_000);
    const farRadius = projectedSphereRadiusPx(1, 20, 60, 1_000);
    assert.ok(Math.abs(nearRadius - 87.0388279778) < 1e-9, `near projection drifted: ${nearRadius}`);
    assert.ok(Math.abs(farRadius - 43.3554984762) < 1e-9, `far projection drifted: ${farRadius}`);
  });

  test("handles invalid geometry and an observer inside the sphere", () => {
    assert.equal(projectedSphereRadiusPx(0, 10, 60, 1_000), 0);
    assert.equal(projectedSphereRadiusPx(1, 0, 60, 1_000), 0);
    assert.equal(projectedSphereRadiusPx(1, 10, 0, 1_000), 0);
    assert.equal(projectedSphereRadiusPx(1, 10, 60, 0), 0);
    assert.equal(projectedSphereRadiusPx(2, 1, 60, 1_000), Number.POSITIVE_INFINITY);
  });
});

describe("sphere LOD selection", () => {
  test("selects the base LOD and always gives selected bodies full detail", () => {
    assert.equal(resolveSphereLod(2, false), "impostor");
    assert.equal(resolveSphereLod(10, false), "low");
    assert.equal(resolveSphereLod(30, false), "medium");
    assert.equal(resolveSphereLod(60, false), "high");
    assert.equal(resolveSphereLod(0, true), "high");
  });

  test("uses quality scaling to retain cheaper representations", () => {
    assert.equal(resolveSphereLod(10, false, 0.5), "low");
    assert.equal(resolveSphereLod(10, false, 0.1), "low");
    assert.equal(resolveSphereLod(10, false, 2), "low");
  });

  test("applies one-rung hysteresis in both directions", () => {
    assert.equal(resolveSphereLod(2.5, false, 1, "impostor"), "impostor");
    assert.equal(resolveSphereLod(3, false, 1, "impostor"), "low");

    assert.equal(resolveSphereLod(1.5, false, 1, "low"), "impostor");
    assert.equal(resolveSphereLod(10, false, 1, "low"), "low");
    assert.equal(resolveSphereLod(17, false, 1, "low"), "medium");

    assert.equal(resolveSphereLod(10, false, 1, "medium"), "low");
    assert.equal(resolveSphereLod(30, false, 1, "medium"), "medium");
    assert.equal(resolveSphereLod(65, false, 1, "medium"), "high");

    assert.equal(resolveSphereLod(40, false, 1, "high"), "medium");
    assert.equal(resolveSphereLod(50, false, 1, "high"), "high");
  });
});

describe("sphere LOD geometry ownership", () => {
  test("creates progressively denser disposable geometries", () => {
    const standard = createSphereLodGeometries(false);
    const compact = createSphereLodGeometries(true);
    assert.ok(standard.low.attributes.position.count < standard.medium.attributes.position.count);
    assert.ok(standard.medium.attributes.position.count < standard.high.attributes.position.count);
    assert.ok(compact.high.attributes.position.count < standard.high.attributes.position.count);
    Object.values(standard).forEach((geometry) => geometry.dispose());
    Object.values(compact).forEach((geometry) => geometry.dispose());
  });

  test("reuses standard and compact geometry sets independently", () => {
    const standardA = getSharedSphereLodGeometries(false);
    const standardB = getSharedSphereLodGeometries(false);
    const compactA = getSharedSphereLodGeometries(true);
    const compactB = getSharedSphereLodGeometries(true);
    assert.strictEqual(standardA, standardB);
    assert.strictEqual(compactA, compactB);
    assert.notStrictEqual(standardA, compactA);
  });
});
