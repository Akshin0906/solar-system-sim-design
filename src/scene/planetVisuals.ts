import * as THREE from "three";
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
  mercury: { baseColor: "#aaa096", textureKind: "rocky", roughness: 0.96 },
  venus: {
    baseColor: "#d9b67f",
    atmosphereColor: "#f0c98c",
    atmosphereOpacity: 0.18,
    cloudOpacity: 0.28,
    textureKind: "venus",
    roughness: 0.9,
  },
  earth: {
    baseColor: "#86b7c2",
    atmosphereColor: "#8bcde4",
    atmosphereOpacity: 0.2,
    cloudOpacity: 0.18,
    textureKind: "earth",
    roughness: 0.66,
  },
  mars: {
    baseColor: "#c9745c",
    atmosphereColor: "#d99875",
    atmosphereOpacity: 0.08,
    textureKind: "mars",
    roughness: 0.92,
  },
  jupiter: { baseColor: "#d1aa7b", textureKind: "gasGiant", roughness: 0.82 },
  saturn: { baseColor: "#d9c59b", textureKind: "gasGiant", roughness: 0.86 },
  uranus: {
    baseColor: "#9cd3cf",
    atmosphereColor: "#a9dad7",
    atmosphereOpacity: 0.12,
    textureKind: "iceGiant",
    roughness: 0.78,
  },
  neptune: {
    baseColor: "#5d84c6",
    atmosphereColor: "#77a2e6",
    atmosphereOpacity: 0.13,
    textureKind: "iceGiant",
    roughness: 0.76,
  },
  pluto: { baseColor: "#b99a79", textureKind: "dwarf", roughness: 0.94 },
  ceres: { baseColor: "#aaa59a", textureKind: "dwarf", roughness: 0.97 },
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

const toCss = ([red, green, blue]: Rgb) => `rgb(${red}, ${green}, ${blue})`;

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

export const createSurfaceTexture = (body: CelestialBody) => {
  const profile = getVisualProfile(body);
  const canvas = document.createElement("canvas");
  const width = body.type === "star" ? 512 : 768;
  const height = body.type === "star" ? 256 : 384;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  const base = hexToRgb(profile.baseColor);
  const seed = bodySeed(body.id);
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const lat = y / height;
    const polar = Math.abs(lat - 0.5) * 2;

    for (let x = 0; x < width; x += 1) {
      const noise = speckle(x, y, seed);
      const band = Math.sin((lat * Math.PI * 2 + seed) * 7 + Math.sin(x * 0.02) * 0.25);
      let color = base;

      if (profile.textureKind === "sun") {
        const cell = wave(x, y, seed) * 0.5 + noise * 0.5;
        color = shade(base, cell > 0.8 ? 0.26 : cell > 0.16 ? 0.08 : -0.06);
      } else if (profile.textureKind === "earth") {
        const landSignal =
          Math.sin(x * 0.021 + Math.sin(y * 0.019) * 2.6) +
          Math.sin(x * 0.047 + y * 0.013) * 0.62 +
          Math.sin(x * 0.009 - y * 0.041) * 0.74;
        const isPolar = polar > 0.82;
        if (isPolar) {
          color = mix([233, 239, 232], [170, 207, 215], Math.min(1, (1 - polar) * 1.7));
        } else if (landSignal > 0.58) {
          color = mix([73, 118, 82], [159, 132, 82], Math.max(0, Math.min(1, noise * 1.1)));
        } else {
          color = mix([24, 83, 111], [35, 126, 147], Math.max(0, Math.min(1, noise * 0.9 + 0.12)));
        }
      } else if (profile.textureKind === "venus") {
        color = shade(base, band * 0.045 + noise * 0.08);
      } else if (profile.textureKind === "mars") {
        const dust = wave(x, y, seed) * 0.08 + noise * 0.12;
        color = mix(shade(base, -0.1), [204, 139, 93], dust + 0.35);
        if (polar > 0.87) {
          color = mix(color, [229, 219, 203], 0.6);
        }
      } else if (profile.textureKind === "gasGiant") {
        const streak = band * 0.11 + Math.sin(lat * 55 + seed) * 0.06 + noise * 0.035;
        const warm: Rgb = body.id === "jupiter" ? [178, 118, 80] : [204, 184, 136];
        color = mix(shade(base, streak), warm, Math.max(0, Math.sin(lat * 37 + seed) * 0.22));
      } else if (profile.textureKind === "iceGiant") {
        color = shade(base, Math.sin(lat * 14 + seed) * 0.035 + noise * 0.045);
      } else {
        const crater = noise > 0.965 ? -0.34 : noise > 0.925 ? 0.18 : 0;
        color = shade(base, wave(x, y, seed) * 0.06 + noise * 0.09 + crater);
      }

      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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
    for (let x = 0; x < width; x += 1) {
      const cloud =
        Math.sin(x * 0.035 + Math.sin(y * 0.018 + seed) * 2.2) +
        Math.sin((x + y) * 0.024 + seed) * 0.58 +
        speckle(x, y, seed) * 0.9;
      const alpha = body.id === "venus" ? Math.max(0, Math.min(255, (cloud + 0.2) * 74)) : Math.max(0, Math.min(190, (cloud - 0.45) * 98));
      const index = (y * width + x) * 4;
      image.data[index] = 246;
      image.data[index + 1] = body.id === "venus" ? 221 : 250;
      image.data[index + 2] = body.id === "venus" ? 174 : 255;
      image.data[index + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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
