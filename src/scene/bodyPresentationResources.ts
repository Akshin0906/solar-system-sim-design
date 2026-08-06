import { SOLAR_LIT_PROGRAM_KEY } from "./materials/solarLighting";

export type BodyRingConfig = {
  innerRadius: number;
  outerRadius: number;
  opacity: number;
  rotationZ: number;
};

export const BODY_RING_CONFIG_BY_ID = {
  saturn: {
    innerRadius: 1.32,
    outerRadius: 2.72,
    opacity: 0.54,
    rotationZ: 0,
  },
  uranus: {
    innerRadius: 1.42,
    outerRadius: 2.1,
    opacity: 0.34,
    rotationZ: Math.PI / 2.8,
  },
} as const satisfies Record<string, BodyRingConfig>;

export const ATMOSPHERE_VERTEX_SHADER = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <fog_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

export const ATMOSPHERE_FRAGMENT_SHADER = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>
  uniform vec3 glowColor;
  uniform vec3 sunsetColor;
  uniform vec3 solarPosition;
  uniform float opacity;
  uniform float power;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 solarDirection = normalize(solarPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normal, viewDirection)), power);
    float sunward = dot(normal, solarDirection);
    float daylight = smoothstep(-0.2, 0.26, sunward);
    float twilight = smoothstep(-0.34, -0.02, sunward) * (1.0 - smoothstep(0.04, 0.42, sunward));
    float phase = 0.72 + 0.28 * pow(abs(dot(viewDirection, -solarDirection)), 2.0);
    vec3 scatteringColor = mix(glowColor, sunsetColor, twilight * 0.62);
    float fade = smoothstep(0.015, 0.92, rim) * mix(0.055, 1.0, daylight) * phase;
    gl_FragColor = vec4(scatteringColor, fade * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export const solarProgramCacheKey = () => SOLAR_LIT_PROGRAM_KEY;
