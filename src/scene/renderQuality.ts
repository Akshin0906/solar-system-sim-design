import { MathUtils, SphereGeometry } from "three";
import { create } from "zustand";

type RenderQualityState = {
  measuredFactor: number;
  setMeasuredFactor: (factor: number) => void;
};

export const clampRenderQuality = (factor: number) => MathUtils.clamp(factor, 0.5, 1);

export const useRenderQualityStore = create<RenderQualityState>((set) => ({
  measuredFactor: 1,
  setMeasuredFactor: (measuredFactor) => set({ measuredFactor: clampRenderQuality(measuredFactor) }),
}));

export const combinedRenderQuality = (interactionFactor: number, measuredFactor: number) =>
  Math.min(clampRenderQuality(interactionFactor), clampRenderQuality(measuredFactor));

export type SphereLodLevel = "impostor" | "low" | "medium" | "high";

export type SphereLodThresholds = {
  impostorMaxPx: number;
  lowMaxPx: number;
  mediumMaxPx: number;
};

export const DEFAULT_SPHERE_LOD_THRESHOLDS: SphereLodThresholds = {
  impostorMaxPx: 2.4,
  lowMaxPx: 14,
  mediumMaxPx: 54,
};

const HYSTERESIS_IN = 1.18;
const HYSTERESIS_OUT = 0.82;

export const projectedSphereRadiusPx = (
  radius: number,
  distanceToCenter: number,
  verticalFovDeg: number,
  viewportHeightPx: number,
) => {
  if (radius <= 0 || distanceToCenter <= 0 || verticalFovDeg <= 0 || viewportHeightPx <= 0) {
    return 0;
  }

  if (distanceToCenter <= radius) {
    return Number.POSITIVE_INFINITY;
  }

  const angularRadius = Math.asin(MathUtils.clamp(radius / distanceToCenter, 0, 1));
  const halfFov = MathUtils.degToRad(verticalFovDeg / 2);
  return (Math.tan(angularRadius) / Math.tan(halfFov)) * (viewportHeightPx / 2);
};

const scaledThresholds = (qualityFactor: number, thresholds: SphereLodThresholds) => {
  // R3F's performance.current lives in [min, 1]. As it regresses, keep each
  // cheaper representation on screen longer. This is deliberately a hook into
  // R3F's existing performance system, not a second frame loop or idle timer.
  const quality = MathUtils.clamp(qualityFactor, 0.5, 1);
  const detailCostScale = 1 / quality;
  return {
    impostorMaxPx: thresholds.impostorMaxPx * detailCostScale,
    lowMaxPx: thresholds.lowMaxPx * detailCostScale,
    mediumMaxPx: thresholds.mediumMaxPx * detailCostScale,
  };
};

const baseSphereLod = (projectedRadiusPx: number, thresholds: SphereLodThresholds): SphereLodLevel => {
  if (projectedRadiusPx < thresholds.impostorMaxPx) {
    return "impostor";
  }
  if (projectedRadiusPx < thresholds.lowMaxPx) {
    return "low";
  }
  if (projectedRadiusPx < thresholds.mediumMaxPx) {
    return "medium";
  }
  return "high";
};

export const resolveSphereLod = (
  projectedRadiusPx: number,
  selected: boolean,
  qualityFactor = 1,
  current?: SphereLodLevel,
  thresholds = DEFAULT_SPHERE_LOD_THRESHOLDS,
): SphereLodLevel => {
  if (selected) {
    return "high";
  }

  const scaled = scaledThresholds(qualityFactor, thresholds);
  if (!current) {
    return baseSphereLod(projectedRadiusPx, scaled);
  }

  // A little hysteresis keeps a sphere from flickering between meshes while a
  // damped camera settles near a threshold. Only one rung changes per frame.
  if (current === "impostor") {
    return projectedRadiusPx > scaled.impostorMaxPx * HYSTERESIS_IN ? "low" : current;
  }
  if (current === "low") {
    if (projectedRadiusPx < scaled.impostorMaxPx * HYSTERESIS_OUT) {
      return "impostor";
    }
    return projectedRadiusPx > scaled.lowMaxPx * HYSTERESIS_IN ? "medium" : current;
  }
  if (current === "medium") {
    if (projectedRadiusPx < scaled.lowMaxPx * HYSTERESIS_OUT) {
      return "low";
    }
    return projectedRadiusPx > scaled.mediumMaxPx * HYSTERESIS_IN ? "high" : current;
  }
  return projectedRadiusPx < scaled.mediumMaxPx * HYSTERESIS_OUT ? "medium" : current;
};

export type SphereLodGeometrySet = Record<Exclude<SphereLodLevel, "impostor">, SphereGeometry>;

export const createSphereLodGeometries = (compact: boolean): SphereLodGeometrySet => ({
  low: new SphereGeometry(1, compact ? 14 : 16, compact ? 9 : 10),
  medium: new SphereGeometry(1, compact ? 26 : 32, compact ? 16 : 20),
  high: new SphereGeometry(1, compact ? 48 : 64, compact ? 30 : 40),
});

export const disposeSphereLodGeometries = (geometries: SphereLodGeometrySet) => {
  geometries.low.dispose();
  geometries.medium.dispose();
  geometries.high.dispose();
};
