import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Line, LineBasicMaterial, Vector3, type Material } from "three";
import { bodiesById } from "../data";
import { DAY_MS } from "../data/constants";
import type { CelestialBody } from "../simulation/orbitalElements";
import { sampleOrbitKm } from "../simulation/solveOrbit";
import { useTimeStore } from "../simulation/timeStore";
import { scaleMoonOffset, scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import type { BodyEmphasis } from "./planetVisuals";
import type { ScenePositionsRef } from "./scenePositions";

// An orbit ellipse only changes shape via slow secular precession, so rebuilding
// its geometry on every animation tick (~30x/s) was a large, pointless alloc/GC
// source (128–240 Vector3s + a fresh BufferGeometry/material per ring per tick).
// Recompute at most ~monthly by keying the memo on a coarse time bucket instead.
const ORBIT_PRECESSION_BUCKET_MS = 30 * DAY_MS;

type OrbitRingProps = {
  body: CelestialBody;
  mode: ScaleMode;
  positionsRef: ScenePositionsRef;
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

export const OrbitRing = memo(({ body, mode, positionsRef, emphasis, highlight }: OrbitRingProps) => {
  const initialPrecessionBucket = Math.floor(useTimeStore.getState().simulationDateMs / ORBIT_PRECESSION_BUCKET_MS);
  const [precessionBucket, setPrecessionBucket] = useState(initialPrecessionBucket);
  const precessionBucketRef = useRef(initialPrecessionBucket);
  const line = useMemo(() => {
    if (!body.orbit) {
      return null;
    }

    const date = new Date(precessionBucket * ORBIT_PRECESSION_BUCKET_MS);
    const points = sampleOrbitKm(body.orbit, body.type === "moon" ? 128 : 240, date).map((point) => {
      const scenePoint =
        body.type === "moon"
          ? scaleMoonOffset(point, mode, {
              parentBody: body.parentId ? bodiesById.get(body.parentId) : undefined,
              moonBody: body,
            })
          : scaleVectorFromSun(point, mode);
      return new Vector3(...scenePoint);
    });
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({
      color: highlight ? "#f4dfad" : body.render.orbitColor ?? "#d8c7a4",
      transparent: true,
      opacity: getOrbitOpacity(body, highlight, emphasis),
      depthWrite: false,
    });

    return new Line(geometry, material);
  }, [body, precessionBucket, mode, highlight, emphasis]);

  useEffect(() => {
    return () => {
      if (line) {
        line.geometry.dispose();
        (line.material as Material).dispose();
      }
    };
  }, [line]);

  useFrame(() => {
    const nextPrecessionBucket = Math.floor(useTimeStore.getState().simulationDateMs / ORBIT_PRECESSION_BUCKET_MS);
    if (nextPrecessionBucket !== precessionBucketRef.current) {
      precessionBucketRef.current = nextPrecessionBucket;
      setPrecessionBucket(nextPrecessionBucket);
    }

    if (line && body.type === "moon" && body.parentId) {
      const parentPosition = positionsRef.current[body.parentId];
      line.position.set(parentPosition?.[0] ?? 0, parentPosition?.[1] ?? 0, parentPosition?.[2] ?? 0);
    }
  });

  if (!body.orbit || !line) {
    return null;
  }

  return <primitive object={line} />;
});

OrbitRing.displayName = "OrbitRing";
