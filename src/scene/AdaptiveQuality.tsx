import { PerformanceMonitor, type PerformanceMonitorApi } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect } from "react";
import { MathUtils } from "three";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { useTimeStore } from "../simulation/timeStore";
import {
  combinedRenderQuality,
  performanceFactorToRenderQuality,
  useRenderQualityStore,
} from "./renderQuality";

// Normal playback invalidates the demand-rendered canvas at 30 Hz. Absolute bounds
// distinguish a renderer that cannot sustain that authored cadence from intentional
// idleness or a high-refresh display; the monitor is unmounted while playback is idle.
export const performanceMonitorBounds = (): [number, number] => [24, 29];

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
  const playbackActive = useTimeStore((state) => !state.isPaused);
  const scenarioAnimating = useScenarioStore(
    (state) => state.activeScenarioId !== null && state.status === "running",
  );
  const measuredFactor = useRenderQualityStore((state) => state.measuredFactor);
  const setMeasuredFactor = useRenderQualityStore((state) => state.setMeasuredFactor);
  const qualityFactor = combinedRenderQuality(interactionFactor, measuredFactor);

  useEffect(() => {
    setDpr(adaptiveDprForQuality(initialDpr, qualityFactor));
  }, [initialDpr, qualityFactor, setDpr]);

  useEffect(
    () => () => {
      setMeasuredFactor(0.75);
      setDpr(initialDpr);
    },
    [initialDpr, setDpr, setMeasuredFactor],
  );

  const record = useCallback(
    ({ factor }: PerformanceMonitorApi) => setMeasuredFactor(performanceFactorToRenderQuality(factor)),
    [setMeasuredFactor],
  );

  return playbackActive || scenarioAnimating ? (
    <PerformanceMonitor
      factor={0.5}
      ms={300}
      iterations={6}
      threshold={0.75}
      // drei counts every incline/decline decision as a flip, even several healthy
      // inclines in the same direction. A finite limit would eventually interpret a
      // stable fast scene as instability and permanently force fallback quality.
      flipflops={Number.POSITIVE_INFINITY}
      bounds={performanceMonitorBounds}
      onChange={record}
    />
  ) : null;
};
