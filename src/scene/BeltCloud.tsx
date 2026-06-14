import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { beltConfigs, type BeltConfig } from "../data/belts";
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

const beltVertexShader = `
attribute float particleSize;
attribute float particleAlpha;
attribute vec3 particleColor;

uniform float uFadeNear;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uMaxPointSize;
uniform float uPixelRatio;
uniform float uSizeMultiplier;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float viewDistance = length(mvPosition.xyz);
  float nearFade = smoothstep(0.0, uFadeNear, viewDistance);
  float farFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, viewDistance);
  float distanceScale = 112.0 / max(28.0, -mvPosition.z);

  vColor = particleColor;
  vAlpha = particleAlpha * nearFade * farFade;

  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(
    particleSize * uSizeMultiplier * uPixelRatio * distanceScale,
    0.5 * uPixelRatio,
    uMaxPointSize * uPixelRatio
  );
}
`;

const beltFragmentShader = `
uniform float uOpacity;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  float falloff = 1.0 - smoothstep(0.12, 0.5, radius);
  float alpha = vAlpha * falloff * uOpacity;

  if (radius > 0.5 || alpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(vColor * (0.86 + falloff * 0.14), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const asteroidPalette = ["#d9c7aa", "#b7aa99", "#8c8580", "#c49a72"].map((color) => new THREE.Color(color));
const kuiperPalette = ["#b7dbe5", "#8fb4c2", "#d6d2c1", "#a6816c"].map((color) => new THREE.Color(color));
const asteroidAccent = new THREE.Color("#efd6aa");
const kuiperAccent = new THREE.Color("#d8f1ff");

const pickParticleColor = (random: () => number, type: BeltConfig["type"]) => {
  const palette = type === "asteroidBelt" ? asteroidPalette : kuiperPalette;
  const color = palette[Math.floor(random() * palette.length)].clone();
  color.lerp(palette[Math.floor(random() * palette.length)], random() * 0.65);

  if (random() > 0.92) {
    color.lerp(type === "asteroidBelt" ? asteroidAccent : kuiperAccent, random() * 0.38);
  }

  color.multiplyScalar(type === "asteroidBelt" ? 0.72 + random() * 0.5 : 0.64 + random() * 0.48);
  return color;
};

const getBeltRenderSettings = (belt: BeltConfig, mode: ScaleMode) => {
  const outerSceneRadius = scaleVectorFromSun([belt.outerRadiusKm, 0, 0], mode)[0];
  const fadeEndFloor = belt.type === "asteroidBelt" ? 160 : 220;
  const fadeEndMultiplier = belt.type === "asteroidBelt" ? 3.1 : 1.55;
  const fadeEnd = Math.max(fadeEndFloor, outerSceneRadius * fadeEndMultiplier);

  return {
    fadeNear: Math.max(12, fadeEnd * 0.075),
    fadeStart: fadeEnd * 0.58,
    fadeEnd,
    maxPointSize: belt.type === "asteroidBelt" ? 5.2 : 4.6,
    sizeMultiplier: belt.type === "asteroidBelt" ? (mode === "overview" ? 2.45 : 2.7) : 2.2,
  };
};

export const BeltCloud = ({ mode, opacityMultiplier = 1 }: BeltCloudProps) => {
  const pixelRatio = useThree(({ gl }) => Math.min(gl.getPixelRatio(), 2));
  const clouds = useMemo(
    () =>
      beltConfigs.map((belt, beltIndex) => {
        const random = seededRandom(4_241 + beltIndex * 991);
        const positions = new Float32Array(belt.particleCount * 3);
        const colors = new Float32Array(belt.particleCount * 3);
        const sizes = new Float32Array(belt.particleCount);
        const alphas = new Float32Array(belt.particleCount);
        const isKuiper = belt.type === "kuiperBelt";

        for (let index = 0; index < belt.particleCount; index += 1) {
          const angle = random() * Math.PI * 2;
          const radiusMix = isKuiper ? Math.pow(random(), 0.88) : Math.sqrt(random());
          const radiusKm = belt.innerRadiusKm + (belt.outerRadiusKm - belt.innerRadiusKm) * radiusMix;
          const verticalKm =
            (random() - 0.5) * belt.verticalSpreadKm * (0.22 + Math.pow(random(), isKuiper ? 1.55 : 2.15));
          const densityWave =
            1 +
            Math.sin(angle * (isKuiper ? 7 : 12) + beltIndex * 1.7) * (isKuiper ? 0.024 : 0.018) +
            Math.sin(angle * (isKuiper ? 17 : 29) + random() * 0.8) * (isKuiper ? 0.011 : 0.008);
          const eccentricX = 1 + Math.sin(angle * 2 + beltIndex) * (isKuiper ? 0.035 : 0.022);
          const eccentricZ = 1 - Math.cos(angle * 3 + beltIndex * 0.5) * (isKuiper ? 0.026 : 0.016);
          const scenePoint = scaleVectorFromSun(
            [
              Math.cos(angle) * radiusKm * densityWave * eccentricX,
              verticalKm,
              Math.sin(angle) * radiusKm * densityWave * eccentricZ,
            ],
            mode,
          );
          const particleColor = pickParticleColor(random, belt.type);
          const sizeSeed = Math.pow(random(), isKuiper ? 1.85 : 1.35);
          const rareLargeBody = random() > (isKuiper ? 0.986 : 0.974);

          positions[index * 3] = scenePoint[0];
          positions[index * 3 + 1] = scenePoint[1];
          positions[index * 3 + 2] = scenePoint[2];
          colors[index * 3] = particleColor.r;
          colors[index * 3 + 1] = particleColor.g;
          colors[index * 3 + 2] = particleColor.b;
          sizes[index] = (isKuiper ? 0.62 + sizeSeed * 1.8 : 0.74 + sizeSeed * 2.5) * (rareLargeBody ? 1.72 : 1);
          alphas[index] = isKuiper ? 0.34 + random() * 0.42 : 0.42 + random() * 0.46;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("particleColor", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("particleSize", new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute("particleAlpha", new THREE.BufferAttribute(alphas, 1));

        return { belt, geometry, renderSettings: getBeltRenderSettings(belt, mode) };
      }),
    [mode],
  );

  useEffect(() => () => clouds.forEach(({ geometry }) => geometry.dispose()), [clouds]);

  return (
    <>
      {clouds.map(({ belt, geometry, renderSettings }) => (
        <points key={belt.id} geometry={geometry}>
          <shaderMaterial
            vertexShader={beltVertexShader}
            fragmentShader={beltFragmentShader}
            uniforms={{
              uFadeNear: { value: renderSettings.fadeNear },
              uFadeStart: { value: renderSettings.fadeStart },
              uFadeEnd: { value: renderSettings.fadeEnd },
              uMaxPointSize: { value: renderSettings.maxPointSize },
              uOpacity: { value: (mode === "real" ? belt.opacity * 0.55 : belt.opacity) * opacityMultiplier },
              uPixelRatio: { value: pixelRatio },
              uSizeMultiplier: { value: renderSettings.sizeMultiplier },
            }}
            transparent
            depthWrite={false}
            depthTest
          />
        </points>
      ))}
    </>
  );
};
