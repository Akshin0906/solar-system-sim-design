import { useMemo } from "react";
import * as THREE from "three";
import { beltConfigs } from "../data/belts";
import { scaleVectorFromSun, type ScaleMode } from "../simulation/units";

type BeltCloudProps = {
  mode: ScaleMode;
  opacityMultiplier?: number;
};

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const BeltCloud = ({ mode, opacityMultiplier = 1 }: BeltCloudProps) => {
  const clouds = useMemo(
    () =>
      beltConfigs.map((belt, beltIndex) => {
        const random = seededRandom(4_241 + beltIndex * 991);
        const positions = new Float32Array(belt.particleCount * 3);
        const sizes = new Float32Array(belt.particleCount);

        for (let index = 0; index < belt.particleCount; index += 1) {
          const angle = random() * Math.PI * 2;
          const radiusKm = belt.innerRadiusKm + (belt.outerRadiusKm - belt.innerRadiusKm) * Math.sqrt(random());
          const verticalKm = (random() - 0.5) * belt.verticalSpreadKm * (0.35 + random());
          const densityWave = 1 + Math.sin(angle * 5 + random() * 0.7) * 0.035;
          const scenePoint = scaleVectorFromSun(
            [Math.cos(angle) * radiusKm * densityWave, verticalKm, Math.sin(angle) * radiusKm * densityWave],
            mode,
          );

          positions[index * 3] = scenePoint[0];
          positions[index * 3 + 1] = scenePoint[1];
          positions[index * 3 + 2] = scenePoint[2];
          sizes[index] = random();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("seedSize", new THREE.BufferAttribute(sizes, 1));

        return { belt, geometry };
      }),
    [mode],
  );

  return (
    <>
      {clouds.map(({ belt, geometry }) => (
        <points key={belt.id} geometry={geometry}>
          <pointsMaterial
            color={belt.color}
            size={belt.type === "asteroidBelt" ? 0.035 : 0.028}
            sizeAttenuation
            transparent
            opacity={(mode === "real" ? belt.opacity * 0.55 : belt.opacity) * opacityMultiplier}
            depthWrite={false}
          />
        </points>
      ))}
    </>
  );
};
