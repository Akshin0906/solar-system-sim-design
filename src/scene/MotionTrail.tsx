import { memo, useEffect, useLayoutEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, type Material } from "three";
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
  const samples = selected ? 42 : 24;

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

  useLayoutEffect(() => {
    if (!line || !body.orbit) {
      return;
    }

    const positionAttribute = line.geometry.getAttribute("position") as BufferAttribute;
    const positions = positionAttribute.array as Float32Array;
    const trailSpanMs = body.orbit.orbitalPeriodDays * 86_400_000 * (body.type === "moon" ? 0.35 : 0.08);

    for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex += 1) {
      const ageIndex = samples - sampleIndex;
      const sampleDate = new Date(dateMs - (trailSpanMs * ageIndex) / samples);
      const position = computeBodyScenePosition(body, bodiesById, sampleDate, mode);
      const arrayIndex = sampleIndex * 3;
      positions[arrayIndex] = position[0];
      positions[arrayIndex + 1] = position[1];
      positions[arrayIndex + 2] = position[2];
    }

    positionAttribute.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }, [body, dateMs, line, mode, samples]);

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
