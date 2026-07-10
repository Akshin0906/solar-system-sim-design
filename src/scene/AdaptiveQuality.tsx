import { PerformanceMonitor, type PerformanceMonitorApi } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect } from "react";
import { MathUtils } from "three";
import { combinedRenderQuality, useRenderQualityStore } from "./renderQuality";

export const performanceMonitorBounds = (refreshRate: number): [number, number] => [
  Math.min(45, refreshRate * 0.55),
  Math.min(58, refreshRate * 0.9),
];

export const adaptiveDprForQuality = (initialDpr: number, qualityFactor: number) => {
  const minimumDpr = Math.min(1, initialDpr);
  return MathUtils.lerp(minimumDpr, initialDpr, MathUtils.clamp(qualityFactor, 0.5, 1));
};

// PerformanceMonitor measures sustained frame throughput while R3F's built-in
// performance.current reacts immediately to camera interaction via OrbitControls'
// `regress` flag. The lower of those signals drives DPR, LOD, and post-processing.
export const AdaptiveQuality = () => {
  const initialDpr = useThree((state) => state.viewport.initialDpr);
  const interactionFactor = useThree((state) => state.performance.current);
  const setDpr = useThree((state) => state.setDpr);
  const measuredFactor = useRenderQualityStore((state) => state.measuredFactor);
  const setMeasuredFactor = useRenderQualityStore((state) => state.setMeasuredFactor);
  const qualityFactor = combinedRenderQuality(interactionFactor, measuredFactor);

  useEffect(() => {
    setDpr(adaptiveDprForQuality(initialDpr, qualityFactor));
  }, [initialDpr, qualityFactor, setDpr]);

  useEffect(
    () => () => {
      setMeasuredFactor(1);
      setDpr(initialDpr);
    },
    [initialDpr, setDpr, setMeasuredFactor],
  );

  const record = useCallback(
    ({ factor }: PerformanceMonitorApi) => setMeasuredFactor(0.5 + MathUtils.clamp(factor, 0, 1) * 0.5),
    [setMeasuredFactor],
  );
  const fallback = useCallback(() => setMeasuredFactor(0.5), [setMeasuredFactor]);

  return (
    <PerformanceMonitor
      ms={300}
      iterations={6}
      threshold={0.75}
      flipflops={4}
      bounds={performanceMonitorBounds}
      onChange={record}
      onFallback={fallback}
    />
  );
};
