import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, type Material } from "three";
import { bodiesById } from "../data";
import { DAY_MS } from "../data/constants";
import type { CelestialBody } from "../simulation/orbitalElements";
import { getOrbitElementsAtDate } from "../simulation/solveOrbit";
import { useTimeStore } from "../simulation/timeStore";
import { computeBodyScenePosition, type ScaleMode } from "../simulation/units";

type MotionTrailProps = {
  body: CelestialBody;
  mode: ScaleMode;
  selected: boolean;
};

const TRAIL_BUCKET_MS = DAY_MS;

export const MotionTrail = memo(({ body, mode, selected }: MotionTrailProps) => {
  const samples = selected ? 42 : 24;
  const initialTrailBucket = Math.floor(useTimeStore.getState().simulationDateMs / TRAIL_BUCKET_MS);
  const [trailBucket, setTrailBucket] = useState(initialTrailBucket);
  const trailBucketRef = useRef(initialTrailBucket);
  const sampleFractions = useMemo(
    () => Array.from({ length: samples + 1 }, (_, sampleIndex) => (samples - sampleIndex) / samples),
    [samples],
  );

  const line = useMemo(() => {
    if (!body.orbit) {
      return null;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array((samples + 1) * 3), 3));
    const material = new LineBasicMaterial({
      color: body.render.trailColor ?? body.physical.color,
      transparent: true,
      opacity: selected ? 0.58 : 0.12,
      depthWrite: false,
    });

    return new Line(geometry, material);
  }, [body.orbit, body.physical.color, body.render.trailColor, samples, selected]);

  useFrame(() => {
    const nextTrailBucket = Math.floor(useTimeStore.getState().simulationDateMs / TRAIL_BUCKET_MS);
    if (nextTrailBucket !== trailBucketRef.current) {
      trailBucketRef.current = nextTrailBucket;
      setTrailBucket(nextTrailBucket);
    }
  });

  useEffect(() => {
    if (!line || !body.orbit) {
      return;
    }

    const positionAttribute = line.geometry.getAttribute("position") as BufferAttribute;
    const positions = positionAttribute.array as Float32Array;
    const dateMs = trailBucket * TRAIL_BUCKET_MS;
    const date = new Date(dateMs);
    const orbit = getOrbitElementsAtDate(body.orbit, date);
    const trailSpanMs = orbit.orbitalPeriodDays * 86_400_000 * (body.type === "moon" ? 0.35 : 0.08);
    const sampleDate = new Date(dateMs);

    for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex += 1) {
      sampleDate.setTime(dateMs - trailSpanMs * sampleFractions[sampleIndex]);
      const position = computeBodyScenePosition(body, bodiesById, sampleDate, mode);
      const arrayIndex = sampleIndex * 3;
      positions[arrayIndex] = position[0];
      positions[arrayIndex + 1] = position[1];
      positions[arrayIndex + 2] = position[2];
    }

    positionAttribute.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }, [body, line, mode, sampleFractions, samples, trailBucket]);

  useEffect(() => {
    return () => {
      if (line) {
        line.geometry.dispose();
        (line.material as Material).dispose();
      }
    };
  }, [line]);

  if (!line) {
    return null;
  }

  return <primitive object={line} />;
});

MotionTrail.displayName = "MotionTrail";
