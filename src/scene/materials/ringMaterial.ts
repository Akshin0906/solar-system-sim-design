import { Color, UniformsLib, UniformsUtils, Vector3, type Texture } from "three";
import type { Vec3 } from "../../simulation/orbitalElements";

type Uniform<T> = { value: T };

export type RingMaterialUniforms = {
  fogColor: Uniform<Color>;
  fogNear: Uniform<number>;
  fogFar: Uniform<number>;
  fogDensity: Uniform<number>;
  ringMap: Uniform<Texture | null>;
  tint: Uniform<Color>;
  opacity: Uniform<number>;
  solarPosition: Uniform<Vector3>;
  hostPosition: Uniform<Vector3>;
  hostRadius: Uniform<number>;
};

export const createRingMaterialUniforms = (
  texture: Texture | undefined,
  opacity: number,
): RingMaterialUniforms => ({
  ...UniformsUtils.clone(UniformsLib.fog),
  ringMap: { value: texture ?? null },
  tint: { value: new Color("#ffffff") },
  opacity: { value: opacity },
  solarPosition: { value: new Vector3() },
  hostPosition: { value: new Vector3() },
  hostRadius: { value: 1 },
});

const setVector = (target: Vector3, value?: Vec3) => {
  if (value) {
    target.set(value[0], value[1], value[2]);
  } else {
    target.set(0, 0, 0);
  }
};

export const updateRingMaterialUniforms = (
  uniforms: RingMaterialUniforms,
  solarPosition: Vec3 | undefined,
  hostPosition: Vec3 | undefined,
  hostRadius: number,
  texture: Texture | undefined,
  opacity: number,
) => {
  setVector(uniforms.solarPosition.value, solarPosition);
  setVector(uniforms.hostPosition.value, hostPosition);
  uniforms.hostRadius.value = hostRadius;
  uniforms.ringMap.value = texture ?? null;
  uniforms.opacity.value = opacity;
};

export const ringVertexShader = `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

export const ringFragmentShader = `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
uniform sampler2D ringMap;
uniform vec3 tint;
uniform float opacity;
uniform vec3 solarPosition;
uniform vec3 hostPosition;
uniform float hostRadius;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

float planetShadow(vec3 point, vec3 toSun) {
  vec3 ray = normalize(toSun);
  vec3 toHost = hostPosition - point;
  float alongRay = dot(toHost, ray);
  if (alongRay <= 0.0 || alongRay >= length(toSun)) return 1.0;
  float perpendicular = length(toHost - ray * alongRay);
  float occlusion = 1.0 - smoothstep(hostRadius * 0.96, hostRadius * 1.06, perpendicular);
  return mix(1.0, 0.035, occlusion);
}

void main() {
  #include <logdepthbuf_fragment>
  vec4 texel = texture2D(ringMap, vUv);
  if (texel.a < 0.012) discard;

  vec3 normal = normalize(vWorldNormal);
  vec3 toSun = solarPosition - vWorldPosition;
  vec3 toCamera = normalize(cameraPosition - vWorldPosition);
  float solarIncidence = max(abs(dot(normal, normalize(toSun))), 0.04);
  float viewIncidence = max(abs(dot(normal, toCamera)), 0.08);
  float oppositeSides = step(0.0, -dot(normalize(toSun), toCamera));
  float backlit = oppositeSides * pow(1.0 - solarIncidence, 2.0) * 0.42;
  float illumination = 0.2 + 0.8 * sqrt(solarIncidence) + backlit;
  float opticalAlpha = 1.0 - exp(-(texel.a * opacity) / viewIncidence);
  float shadow = planetShadow(vWorldPosition, toSun);

  gl_FragColor = vec4(texel.rgb * tint * illumination * shadow, clamp(opticalAlpha, 0.0, 0.92));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
