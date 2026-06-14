import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { bodiesById } from "../data";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { sampleOrbitKm } from "../simulation/solveOrbit";
import { scaleMoonOffset, scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import type { BodyEmphasis } from "./planetVisuals";

type OrbitRingProps = {
  body: CelestialBody;
  mode: ScaleMode;
  positions: Record<string, Vec3>;
  emphasis: BodyEmphasis;
  highlight: boolean;
};

const getOrbitOpacity = (body: CelestialBody, selected: boolean, emphasis: BodyEmphasis) => {
  if (selected) {
    return 0.88;
  }

  if (emphasis === "muted") {
    return body.type === "moon" ? 0.04 : 0.07;
  }

  if (emphasis === "primary") {
    return body.type === "moon" ? 0.5 : 0.035;
  }

  if (emphasis === "related") {
    return body.type === "moon" ? 0.44 : 0.36;
  }

  return body.type === "moon" ? 0.2 : 0.28;
};

export const OrbitRing = memo(({ body, mode, positions, emphasis, highlight }: OrbitRingProps) => {
  const line = useMemo(() => {
    if (!body.orbit) {
      return null;
    }

    const points = sampleOrbitKm(body.orbit, body.type === "moon" ? 128 : 240).map((point) => {
      const scenePoint =
        body.type === "moon"
          ? scaleMoonOffset(point, mode, {
              parentBody: body.parentId ? bodiesById.get(body.parentId) : undefined,
              moonBody: body,
            })
          : scaleVectorFromSun(point, mode);
      return new THREE.Vector3(...scenePoint);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: highlight ? "#f4dfad" : body.render.orbitColor ?? "#d8c7a4",
      transparent: true,
      opacity: getOrbitOpacity(body, highlight, emphasis),
      depthWrite: false,
    });

    return new THREE.Line(geometry, material);
  }, [body, mode, highlight, emphasis]);

  useEffect(() => {
    return () => {
      if (line) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [line]);

  if (!body.orbit || !line) {
    return null;
  }

  const parentPosition = body.type === "moon" && body.parentId ? positions[body.parentId] ?? [0, 0, 0] : [0, 0, 0];
  line.position.set(parentPosition[0], parentPosition[1], parentPosition[2]);

  return <primitive object={line} />;
});

OrbitRing.displayName = "OrbitRing";
