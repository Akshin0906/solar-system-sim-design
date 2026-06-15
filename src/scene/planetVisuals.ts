import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import type { CelestialBody } from "../simulation/orbitalElements";

export type BodyEmphasis = "primary" | "related" | "normal" | "muted";

type Rgb = [number, number, number];

type VisualProfile = {
  baseColor: string;
  roughness: number;
  metalness?: number;
  emissive?: string;
  atmosphereColor?: string;
  atmosphereOpacity?: number;
  bumpScale?: number;
  cloudOpacity?: number;
  textureKind:
    | "sun"
    | "earth"
    | "venus"
    | "mars"
    | "gasGiant"
    | "iceGiant"
    | "rocky"
    | "moon"
    | "dwarf";
};

const profileById: Record<string, Partial<VisualProfile>> = {
  sun: {
    baseColor: "#ffbd6a",
    emissive: "#f4a14f",
    roughness: 0.9,
    textureKind: "sun",
  },
  mercury: { baseColor: "#aaa096", bumpScale: 0.032, textureKind: "rocky", roughness: 0.96 },
  venus: {
    baseColor: "#d9b67f",
    atmosphereColor: "#f0c98c",
    atmosphereOpacity: 0.18,
    bumpScale: 0,
    cloudOpacity: 0.28,
    textureKind: "venus",
    roughness: 0.9,
  },
  earth: {
    baseColor: "#86b7c2",
    atmosphereColor: "#8bcde4",
    atmosphereOpacity: 0.2,
    bumpScale: 0.012,
    cloudOpacity: 0.18,
    textureKind: "earth",
    roughness: 0.66,
  },
  mars: {
    baseColor: "#c9745c",
    atmosphereColor: "#d99875",
    atmosphereOpacity: 0.08,
    bumpScale: 0.026,
    textureKind: "mars",
    roughness: 0.92,
  },
  jupiter: { baseColor: "#d1aa7b", bumpScale: 0, textureKind: "gasGiant", roughness: 0.82 },
  saturn: { baseColor: "#d9c59b", bumpScale: 0, textureKind: "gasGiant", roughness: 0.86 },
  uranus: {
    baseColor: "#9cd3cf",
    atmosphereColor: "#a9dad7",
    atmosphereOpacity: 0.12,
    bumpScale: 0,
    textureKind: "iceGiant",
    roughness: 0.78,
  },
  neptune: {
    baseColor: "#5d84c6",
    atmosphereColor: "#77a2e6",
    atmosphereOpacity: 0.13,
    bumpScale: 0,
    textureKind: "iceGiant",
    roughness: 0.76,
  },
  pluto: { baseColor: "#b99a79", bumpScale: 0.034, textureKind: "dwarf", roughness: 0.94 },
  ceres: { baseColor: "#aaa59a", bumpScale: 0.038, textureKind: "dwarf", roughness: 0.97 },
};

const defaultProfile = (body: CelestialBody): VisualProfile => {
  const kind =
    body.type === "star"
      ? "sun"
      : body.type === "moon"
        ? "moon"
        : body.type === "dwarfPlanet"
          ? "dwarf"
          : "rocky";

  return {
    baseColor: body.physical.color,
    roughness: body.type === "star" ? 0.9 : 0.86,
    metalness: 0.015,
    emissive: body.type === "star" ? body.physical.color : "#000000",
    bumpScale:
      body.type === "moon"
        ? 0.036
        : body.type === "dwarfPlanet"
          ? 0.034
          : body.type === "planet"
            ? 0.016
            : 0,
    textureKind: kind,
    ...profileById[body.id],
  };
};

export const getVisualProfile = (body: CelestialBody) => defaultProfile(body);

const hexToRgb = (hex: string): Rgb => {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
};

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * amount),
  Math.round(a[1] + (b[1] - a[1]) * amount),
  Math.round(a[2] + (b[2] - a[2]) * amount),
];

const shade = (rgb: Rgb, amount: number): Rgb => {
  const target: Rgb = amount > 0 ? [255, 255, 255] : [0, 0, 0];
  return mix(rgb, target, Math.abs(amount));
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

const wave = (x: number, y: number, seed: number) =>
  Math.sin(x * 0.038 + seed) +
  Math.sin(y * 0.071 + seed * 1.7) * 0.52 +
  Math.sin((x + y) * 0.022 + seed * 2.3) * 0.36;

const speckle = (x: number, y: number, seed: number) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43_758.5453;
  return value - Math.floor(value);
};

const bodySeed = (id: string) =>
  id.split("").reduce((seed, char, index) => seed + char.charCodeAt(0) * (index + 11), 17);

const valueNoise = (x: number, y: number, seed: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smoothstep(0, 1, x - x0);
  const sy = smoothstep(0, 1, y - y0);
  const top = speckle(x0, y0, seed) * (1 - sx) + speckle(x0 + 1, y0, seed) * sx;
  const bottom = speckle(x0, y0 + 1, seed) * (1 - sx) + speckle(x0 + 1, y0 + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
};

const fbm = (x: number, y: number, seed: number, octaves = 4) => {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let max = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 23.17) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return max === 0 ? 0 : total / max;
};

type Crater = {
  u: number;
  v: number;
  radius: number;
  depth: number;
  rim: number;
};

const craterCountFor = (profile: VisualProfile, body: CelestialBody) => {
  if (body.id === "earth" || profile.textureKind === "venus") {
    return 0;
  }

  if (profile.textureKind === "moon") {
    return body.id === "moon" ? 48 : 34;
  }

  if (profile.textureKind === "rocky") {
    return body.id === "mercury" ? 58 : 26;
  }

  if (profile.textureKind === "dwarf") {
    return 38;
  }

  return profile.textureKind === "mars" ? 32 : 0;
};

const createCraterSet = (seed: number, count: number): Crater[] =>
  Array.from({ length: count }, (_, index) => {
    const sizeBias = speckle(index + 1.1, 7.3, seed);
    return {
      u: speckle(index + 2.7, 11.9, seed),
      v: clamp(0.06 + speckle(index + 4.1, 19.5, seed) * 0.88),
      radius: 0.008 + Math.pow(sizeBias, 2.2) * 0.042,
      depth: 0.12 + speckle(index + 5.8, 23.1, seed) * 0.24,
      rim: 0.05 + speckle(index + 8.4, 31.7, seed) * 0.13,
    };
  });

const craterRelief = (u: number, v: number, craters: Crater[]) => {
  let relief = 0;

  for (const crater of craters) {
    const wrappedU = Math.abs(u - crater.u);
    const du = Math.min(wrappedU, 1 - wrappedU) * 2;
    const distance = Math.hypot(du, v - crater.v);

    if (distance > crater.radius) {
      continue;
    }

    const normalized = distance / crater.radius;
    const bowl = 1 - smoothstep(0.18, 0.82, normalized);
    const rim = Math.max(0, 1 - Math.abs(normalized - 0.82) / 0.18);
    relief -= bowl * crater.depth;
    relief += rim * rim * crater.rim;
  }

  return relief;
};

const earthLandSignal = (u: number, v: number, seed: number) => {
  const latitude = Math.abs(v - 0.5) * 2;
  const plates =
    Math.sin(u * Math.PI * 7.2 + Math.sin(v * Math.PI * 6.1 + seed) * 1.5) * 0.32 +
    Math.sin((u - v) * Math.PI * 5.6 + seed * 0.4) * 0.22;
  const continents = fbm(u * 5.2, v * 3.4, seed + 14.5, 4);
  return continents + plates - 0.52 - latitude * 0.08;
};

const terrainHeight = (
  profile: VisualProfile,
  u: number,
  v: number,
  seed: number,
  craters: Crater[],
) => {
  const rugged = fbm(u * 10.5, v * 5.4, seed + 40.2, 4);
  const fine = fbm(u * 28, v * 14, seed + 91.8, 3);
  const polar = Math.abs(v - 0.5) * 2;

  if (profile.textureKind === "earth") {
    const land = smoothstep(0.02, 0.22, earthLandSignal(u, v, seed));
    const mountain = Math.max(0, rugged - 0.58) * 0.56;
    return clamp(0.34 + land * 0.32 + mountain + fine * 0.08);
  }

  if (profile.textureKind === "mars") {
    const canyon = Math.max(0, 1 - Math.abs(v - 0.46) / 0.035) * smoothstep(0.28, 0.72, u) * (1 - smoothstep(0.72, 0.96, u));
    return clamp(0.52 + (rugged - 0.5) * 0.34 + fine * 0.09 + craterRelief(u, v, craters) - canyon * 0.22);
  }

  if (profile.textureKind === "moon" || profile.textureKind === "rocky" || profile.textureKind === "dwarf") {
    const basin = smoothstep(0.57, 0.86, fbm(u * 6.4, v * 3.2, seed + 122.4, 3)) * (1 - smoothstep(0.72, 0.98, polar));
    return clamp(0.55 + (rugged - 0.5) * 0.28 + (fine - 0.5) * 0.14 + craterRelief(u, v, craters) - basin * 0.12);
  }

  return clamp(0.5 + (rugged - 0.5) * 0.2);
};

const ringBandAlpha = (bodyId: string, bandPosition: number, seed: number) => {
  if (bodyId === "uranus") {
    const narrowBands = [0.1, 0.2, 0.34, 0.52, 0.78, 0.9];
    const band = narrowBands.reduce((total, band) => {
      const distance = Math.abs(bandPosition - band);
      return total + Math.max(0, 1 - distance / 0.018);
    }, 0);
    return clamp(0.08 + band * 0.46 + valueNoise(bandPosition * 32, 0, seed) * 0.08, 0, 0.72);
  }

  const waves =
    Math.sin(bandPosition * 86 + seed) * 0.1 +
    Math.sin(bandPosition * 173 + seed * 0.31) * 0.055 +
    valueNoise(bandPosition * 42, 0, seed) * 0.2;
  const cassiniGap = 1 - smoothstep(0.56, 0.585, bandPosition) * (1 - smoothstep(0.61, 0.64, bandPosition));
  const enckeGap = 1 - smoothstep(0.82, 0.835, bandPosition) * (1 - smoothstep(0.845, 0.86, bandPosition));
  return clamp((0.46 + waves) * cassiniGap * enckeGap, 0.035, 0.78);
};

export const createSurfaceTexture = (body: CelestialBody) => {
  const profile = getVisualProfile(body);
  const canvas = document.createElement("canvas");
  const width = body.type === "star" ? 512 : body.type === "moon" ? 512 : 768;
  const height = body.type === "star" ? 256 : body.type === "moon" ? 256 : 384;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const base = hexToRgb(profile.baseColor);
  const seed = bodySeed(body.id);
  const craters = createCraterSet(seed, craterCountFor(profile, body));
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    const lat = v;
    const polar = Math.abs(lat - 0.5) * 2;

    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const noise = speckle(x, y, seed);
      const band = Math.sin((lat * Math.PI * 2 + seed) * 7 + Math.sin(x * 0.02) * 0.25);
      const terrain = terrainHeight(profile, u, v, seed, craters);
      let color = base;

      if (profile.textureKind === "sun") {
        const cell = wave(x, y, seed) * 0.42 + fbm(u * 10, v * 5, seed + 10.4, 3) * 0.58;
        const flare = Math.max(0, Math.sin(u * Math.PI * 12 + seed) * Math.sin(v * Math.PI * 5 + seed * 0.3)) * 0.08;
        color = shade(base, cell > 0.86 ? 0.28 + flare : cell > 0.28 ? 0.1 + flare : -0.055);
      } else if (profile.textureKind === "earth") {
        const landSignal = earthLandSignal(u, v, seed);
        const isPolar = polar > 0.82;
        if (isPolar) {
          color = mix([233, 239, 232], [170, 207, 215], Math.min(1, (1 - polar) * 1.7));
        } else if (landSignal > 0.02) {
          const desertBelt = smoothstep(0.24, 0.52, Math.abs(polar - 0.36));
          const highland = smoothstep(0.62, 0.9, terrain);
          color = mix([55, 112, 84], [169, 137, 88], clamp(desertBelt * 0.42 + noise * 0.34));
          color = mix(color, [198, 187, 154], highland * 0.38);
        } else {
          const shelf = smoothstep(-0.12, 0.03, landSignal);
          color = mix([19, 71, 111], [54, 148, 158], clamp(noise * 0.54 + shelf * 0.44));
        }
      } else if (profile.textureKind === "venus") {
        const sulfur = fbm(u * 7.4, v * 4.2, seed + 18.1, 4);
        color = shade(base, band * 0.045 + sulfur * 0.12 + noise * 0.035);
      } else if (profile.textureKind === "mars") {
        const dust = fbm(u * 8.2, v * 4.4, seed + 27.6, 4) * 0.44 + noise * 0.12;
        color = mix(shade(base, -0.13 + (terrain - 0.5) * 0.22), [204, 139, 93], clamp(dust + 0.24));
        if (polar > 0.87) {
          color = mix(color, [229, 219, 203], 0.6);
        }
      } else if (profile.textureKind === "gasGiant") {
        const turbulence = fbm(u * 10.2, v * 7.4, seed + 51.3, 3);
        const streak = band * 0.11 + Math.sin(lat * 55 + seed) * 0.06 + (turbulence - 0.5) * 0.09;
        const warm: Rgb = body.id === "jupiter" ? [178, 118, 80] : [204, 184, 136];
        color = mix(shade(base, streak), warm, Math.max(0, Math.sin(lat * 37 + seed) * 0.22));
        if (body.id === "jupiter") {
          const storm = Math.hypot((u - 0.64) * 3.8, (v - 0.57) * 12);
          color = mix(color, [184, 101, 74], Math.max(0, 1 - storm) * 0.42);
        }
      } else if (profile.textureKind === "iceGiant") {
        const haze = fbm(u * 5.5, v * 4.2, seed + 64.7, 3);
        color = shade(base, Math.sin(lat * 14 + seed) * 0.035 + (haze - 0.5) * 0.08 + noise * 0.018);
      } else {
        const mare = profile.textureKind === "moon" ? smoothstep(0.56, 0.84, fbm(u * 6.2, v * 3.2, seed + 33.3, 3)) : 0;
        color = shade(base, (terrain - 0.5) * 0.52 + (noise - 0.5) * 0.07 - mare * 0.16);
        if (body.id === "europa") {
          const crack = Math.max(0, 1 - Math.abs(Math.sin((u * 17 + v * 9 + seed) * Math.PI)) / 0.055);
          color = mix(color, [136, 105, 90], clamp(crack * 0.28));
        } else if (body.id === "io") {
          const sulfur = fbm(u * 14, v * 7, seed + 77.1, 3);
          color = mix(color, [199, 144, 67], smoothstep(0.55, 0.86, sulfur) * 0.5);
        } else if (body.id === "titan") {
          color = mix(color, [196, 126, 61], 0.24);
        }
      }

      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
};

export const createBodyBumpTexture = (body: CelestialBody) => {
  const profile = getVisualProfile(body);

  if (!profile.bumpScale) {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  const width = body.type === "moon" ? 384 : 512;
  const height = body.type === "moon" ? 192 : 256;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const seed = bodySeed(`${body.id}-relief`);
  const craters = createCraterSet(seed, craterCountFor(profile, body));
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / height;

    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const heightValue = Math.round(terrainHeight(profile, u, v, seed, craters) * 255);
      const index = (y * width + x) * 4;
      image.data[index] = heightValue;
      image.data[index + 1] = heightValue;
      image.data[index + 2] = heightValue;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
};

export const createCloudTexture = (body: CelestialBody) => {
  if (body.id !== "earth" && body.id !== "venus") {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  const width = 768;
  const height = 384;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const seed = bodySeed(`${body.id}-clouds`);
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / height;

    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const cloud =
        Math.sin(x * 0.035 + Math.sin(y * 0.018 + seed) * 2.2) +
        Math.sin((x + y) * 0.024 + seed) * 0.58 +
        fbm(u * 13, v * 6.5, seed + 8.2, 3) * 1.1 +
        speckle(x, y, seed) * 0.38;
      const alpha =
        body.id === "venus"
          ? Math.max(0, Math.min(255, (cloud + 0.15) * 64))
          : Math.max(0, Math.min(190, (cloud - 1.02) * 92));
      const index = (y * width + x) * 4;
      image.data[index] = 246;
      image.data[index + 1] = body.id === "venus" ? 221 : 250;
      image.data[index + 2] = body.id === "venus" ? 174 : 255;
      image.data[index + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
};

export const createRingTexture = (body: CelestialBody, innerToOuterRatio: number) => {
  if (body.id !== "saturn" && body.id !== "uranus") {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const seed = bodySeed(`${body.id}-rings`);
  const image = context.createImageData(size, size);
  const base = hexToRgb(body.id === "saturn" ? "#d8c493" : "#b7d4d3");
  const accent = hexToRgb(body.id === "saturn" ? "#f0dfb0" : "#d7eeee");

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1) - 0.5;

    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1) - 0.5;
      const radius = Math.hypot(u, v) * 2;
      const bandPosition = clamp((radius - innerToOuterRatio) / (1 - innerToOuterRatio));
      const insideRing = radius >= innerToOuterRatio && radius <= 1;
      const alpha = insideRing ? ringBandAlpha(body.id, bandPosition, seed) : 0;
      const grain = valueNoise(bandPosition * 52, Math.atan2(v, u) * 0.35, seed);
      const color = mix(shade(base, (grain - 0.5) * 0.14), accent, body.id === "saturn" ? bandPosition * 0.18 : 0.12);
      const index = (y * size + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
};

export const getEmphasisOpacity = (emphasis: BodyEmphasis) => {
  if (emphasis === "muted") {
    return 0.24;
  }

  if (emphasis === "related") {
    return 0.82;
  }

  return 1;
};
