import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PointLight } from "three";
import type { ScenePositionsRef } from "./scenePositions";

type LightingProps = {
  positionsRef: ScenePositionsRef;
};

export const Lighting = ({ positionsRef }: LightingProps) => {
  const solarLightRef = useRef<PointLight>(null);

  useFrame(() => {
    const position = positionsRef.current.sun;
    if (position && solarLightRef.current) {
      solarLightRef.current.position.set(position[0], position[1], position[2]);
    }
  });

  return (
    <>
      {/* A very faint blue-black floor preserves texture detail on the night side without
          inventing a second light direction. The Sun remains the sole direct key, so every
          body's terminator agrees with its actual scene-space direction to the solar mesh. */}
      <ambientLight intensity={0.045} color="#6f829e" />
      {/* Scene modes deliberately remap astronomical distance, so inverse-square falloff in
          those remapped units would make outer worlds arbitrarily dark. A zero-decay solar
          key preserves direction and phase while leaving flux outside this visual model. */}
      <pointLight
        ref={solarLightRef}
        position={[0, 0, 0]}
        intensity={2.15}
        distance={0}
        color="#fff0d6"
        decay={0}
      />
    </>
  );
};
