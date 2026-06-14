import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { bodiesById } from "../data";
import type { CelestialBody } from "../simulation/orbitalElements";
import { computeBodyScenePosition, type ScaleMode } from "../simulation/units";

type MotionTrailProps = {
  body: CelestialBody;
  dateMs: number;
  mode: ScaleMode;
  selected: boolean;
};

export const MotionTrail = memo(({ body, dateMs, mode, selected }: MotionTrailProps) => {
  const line = useMemo(() => {
    if (!body.orbit) {
      return null;
    }

    const samples = selected ? 42 : 24;
    const trailSpanMs = body.orbit.orbitalPeriodDays * 86_400_000 * (body.type === "moon" ? 0.35 : 0.08);
    const points: THREE.Vector3[] = [];

    for (let index = samples; index >= 0; index -= 1) {
      const sampleDate = new Date(dateMs - (trailSpanMs * index) / samples);
      const position = computeBodyScenePosition(body, bodiesById, sampleDate, mode);
      points.push(new THREE.Vector3(...position));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: body.render.trailColor ?? body.physical.color,
      transparent: true,
      opacity: selected ? 0.58 : 0.12,
      depthWrite: false,
    });

    return new THREE.Line(geometry, material);
  }, [body, dateMs, mode, selected]);

  useEffect(() => {
    return () => {
      if (line) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [line]);

  if (!line) {
    return null;
  }

  return <primitive object={line} />;
});

MotionTrail.displayName = "MotionTrail";
