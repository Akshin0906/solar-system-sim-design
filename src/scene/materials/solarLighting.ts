import { Vector3, type MeshStandardMaterial } from "three";
import type { CelestialBody, Vec3 } from "../../simulation/orbitalElements";
import { getBodySceneRadius, type ScaleMode } from "../../simulation/units";
import { MAX_ANALYTIC_OCCLUDERS } from "../eclipseShadows";
import type { ScenePositions } from "../scenePositions";

type Uniform<T> = { value: T };

export type SolarLightingUniforms = {
  solarPosition: Uniform<Vector3>;
  analyticOccluderCount: Uniform<number>;
  analyticOccluderPositions: Uniform<Vector3[]>;
  analyticOccluderRadii: Uniform<number[]>;
};

type StandardShader = Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];

export const createSolarLightingUniforms = (): SolarLightingUniforms => ({
  solarPosition: { value: new Vector3() },
  analyticOccluderCount: { value: 0 },
  analyticOccluderPositions: {
    value: Array.from({ length: MAX_ANALYTIC_OCCLUDERS }, () => new Vector3()),
  },
  analyticOccluderRadii: { value: Array.from({ length: MAX_ANALYTIC_OCCLUDERS }, () => 0) },
});

const positionToVector = (target: Vector3, position?: Vec3) => {
  if (position) {
    target.set(position[0], position[1], position[2]);
  } else {
    target.set(0, 0, 0);
  }
};

export const updateSolarLightingUniforms = (
  uniforms: SolarLightingUniforms,
  positions: ScenePositions,
  occluders: CelestialBody[],
  mode: ScaleMode,
) => {
  positionToVector(uniforms.solarPosition.value, positions.sun);
  const count = Math.min(occluders.length, MAX_ANALYTIC_OCCLUDERS);
  uniforms.analyticOccluderCount.value = count;

  for (let index = 0; index < MAX_ANALYTIC_OCCLUDERS; index += 1) {
    const occluder = index < count ? occluders[index] : undefined;
    positionToVector(uniforms.analyticOccluderPositions.value[index], occluder ? positions[occluder.id] : undefined);
    uniforms.analyticOccluderRadii.value[index] = occluder ? getBodySceneRadius(occluder, mode) : 0;
  }
};

const SOLAR_LIGHTING_FRAGMENT_PARS = `
uniform vec3 solarPosition;
uniform int analyticOccluderCount;
uniform vec3 analyticOccluderPositions[${MAX_ANALYTIC_OCCLUDERS}];
uniform float analyticOccluderRadii[${MAX_ANALYTIC_OCCLUDERS}];
varying vec3 vSolarWorldPosition;

float getAnalyticSolarVisibility(vec3 surfacePosition) {
  vec3 toSun = solarPosition - surfacePosition;
  float solarDistance = length(toSun);
  if (solarDistance <= 0.000001) return 1.0;
  vec3 solarRay = toSun / solarDistance;
  float occlusion = 0.0;

  for (int index = 0; index < ${MAX_ANALYTIC_OCCLUDERS}; index++) {
    if (index >= analyticOccluderCount) continue;
    vec3 toOccluder = analyticOccluderPositions[index] - surfacePosition;
    float alongRay = dot(toOccluder, solarRay);
    if (alongRay <= 0.0 || alongRay >= solarDistance) continue;
    float perpendicular = length(toOccluder - solarRay * alongRay);
    float radius = analyticOccluderRadii[index];
    float shadow = 1.0 - smoothstep(radius * 0.82, radius * 1.18, perpendicular);
    occlusion = max(occlusion, shadow);
  }

  // A five-percent floor avoids quantization/banding in very dark totality while
  // preserving an unmistakable direct-light shadow.
  return mix(1.0, 0.05, occlusion);
}
`;

export const patchSolarLitMaterial = (shader: StandardShader, uniforms: SolarLightingUniforms) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vSolarWorldPosition;")
    .replace(
      "#include <project_vertex>",
      "vSolarWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${SOLAR_LIGHTING_FRAGMENT_PARS}`)
    .replace(
      "vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;",
      `float analyticSolarVisibility = getAnalyticSolarVisibility(vSolarWorldPosition);
       reflectedLight.directDiffuse *= analyticSolarVisibility;
       reflectedLight.directSpecular *= analyticSolarVisibility;
       vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;`,
    );
};

export const SOLAR_LIT_PROGRAM_KEY = "solar-lit-pbr-v1";
