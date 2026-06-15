import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Color, type Sprite, type SpriteMaterial } from "three";
import { bodiesById } from "../../data";
import { getMoltenBodies } from "../../scenarios/scenarioRuntime";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import { getBodySceneRadius, scaleDistanceFromSun, scaleVectorFromSun, type ScaleMode } from "../../simulation/units";

const POOL = 4; // at most a couple of bodies glow at once (a remnant + a struck planet)

// Cooling colour ramp: white-hot → orange → deep red as heat falls from 1 to 0.
const HOT = new Color("#fff1cf");
const WARM = new Color("#ff8a2e");
const COOL = new Color("#c22a0a");
const scratch = new Color();
const heatColor = (heat: number) => {
  if (heat > 0.55) {
    return scratch.copy(WARM).lerp(HOT, (heat - 0.55) / 0.45);
  }
  return scratch.copy(COOL).lerp(WARM, heat / 0.55);
};

const makeGlowTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

// Glows a freshly-formed molten giant-impact remnant (and an impact afterglow) with an
// additive halo that cools from white-hot to deep red as the integrator's moltenHeat decays.
// Tracks live bodies via getMoltenBodies; renders nothing when none are hot.
export const MoltenRemnant = ({ mode }: { mode: ScaleMode }) => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const tex = useMemo(makeGlowTexture, []);
  const refs = useRef<(Sprite | null)[]>([]);

  useEffect(() => () => tex.dispose(), [tex]);

  useFrame((state) => {
    const sprites = refs.current;
    const time = state.clock.elapsedTime;
    const molten = activeScenarioId ? getMoltenBodies() : [];
    for (let i = 0; i < POOL; i += 1) {
      const sprite = sprites[i];
      if (!sprite) {
        continue;
      }
      const body = molten[i];
      if (!body) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const [x, y, z] = scaleVectorFromSun(body.posKm, mode);
      sprite.position.set(x, y, z);
      const heat = Math.min(body.moltenHeat ?? 0, 1);
      // Size off the data body's on-screen radius (matches BodyMesh); halo a bit larger.
      const data = body.sourceId ? bodiesById.get(body.sourceId) : undefined;
      const baseRadius = data ? getBodySceneRadius(data, mode) : Math.max(scaleDistanceFromSun(body.radiusKm, mode), 0.1);
      const pulse = 1 + 0.12 * Math.sin(time * 6 + i);
      const scale = baseRadius * (2.4 + 1.2 * heat) * pulse;
      sprite.scale.set(scale, scale, 1);
      const mat = sprite.material as SpriteMaterial;
      mat.color.copy(heatColor(heat));
      mat.opacity = 0.35 + 0.5 * heat;
    }
  });

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <sprite
          key={`molten-${i}`}
          ref={(node) => {
            refs.current[i] = node;
          }}
          visible={false}
        >
          <spriteMaterial map={tex} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
};
