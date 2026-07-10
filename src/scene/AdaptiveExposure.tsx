import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import type { ScenePositionsRef } from "./scenePositions";

const DEFAULT_EXPOSURE = 1.08;
const NEAR_SOLAR_EXPOSURE = 0.8;

export const solarExposureForDistance = (distanceToSun: number, solarRadius: number) => {
  if (distanceToSun <= 0 || solarRadius <= 0) {
    return DEFAULT_EXPOSURE;
  }
  const radiiFromSun = distanceToSun / solarRadius;
  const amount = MathUtils.smoothstep(radiiFromSun, 2.2, 5.5);
  return MathUtils.lerp(NEAR_SOLAR_EXPOSURE, DEFAULT_EXPOSURE, amount);
};

type AdaptiveExposureProps = {
  positionsRef: ScenePositionsRef;
  solarRadius: number;
};

export const AdaptiveExposure = ({ positionsRef, solarRadius }: AdaptiveExposureProps) => {
  const gl = useThree((state) => state.gl);
  const sunPosition = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const currentExposureRef = useRef(gl.toneMappingExposure || DEFAULT_EXPOSURE);

  useEffect(() => {
    return () => {
      gl.toneMappingExposure = DEFAULT_EXPOSURE;
    };
  }, [gl]);

  useFrame(({ camera }, delta) => {
    const position = positionsRef.current.sun;
    if (!position) {
      return;
    }
    sunPosition.set(position[0], position[1], position[2]);
    camera.getWorldPosition(cameraPosition);
    const target = solarExposureForDistance(cameraPosition.distanceTo(sunPosition), solarRadius);
    const damping = 1 - Math.exp(-5 * Math.min(delta, 0.12));
    const next = MathUtils.lerp(currentExposureRef.current, target, damping);
    if (Math.abs(next - currentExposureRef.current) > 0.0001) {
      currentExposureRef.current = next;
      gl.toneMappingExposure = next;
    }
  });

  return null;
};
