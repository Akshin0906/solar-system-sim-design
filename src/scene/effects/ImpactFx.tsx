import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Color, type Sprite, type SpriteMaterial } from "three";
import { drainImpactFx } from "../../scenarios/scenarioRuntime";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import type { Vec3 } from "../../simulation/orbitalElements";
import { scaleDistanceFromSun, scaleVectorFromSun, type ScaleMode } from "../../simulation/units";

// Transient impact VFX: a pool of billboarded sprites that flash and expand when the
// integrator reports a violent contact (impact, shatter, giant-impact merge). Sprites
// auto-face the camera; lifetimes run on real (wall-clock) time so a flash reads the same
// at any time scale, and the pool caps how many play at once (excess events just don't
// spawn — purely cosmetic, never physics).
const POOL_FLASH = 16;
const POOL_SHOCK = 16;
const FLASH_LIFE = 0.62; // seconds
const SHOCK_LIFE = 1.15; // seconds

type Slot = { active: boolean; age: number; pos: Vec3; size: number };

const makeSlots = (n: number): Slot[] =>
  Array.from({ length: n }, () => ({ active: false, age: 0, pos: [0, 0, 0] as Vec3, size: 0 }));

// Soft radial glow (white→transparent) for the impact flash.
const makeFlashTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

// Thin bright annulus (transparent core, ring, transparent rim) for the shockwave.
const makeShockTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(255,255,255,0)");
  g.addColorStop(0.8, "rgba(255,255,255,0.9)");
  g.addColorStop(0.9, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

export const ImpactFx = ({ mode }: { mode: ScaleMode }) => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const flashTex = useMemo(makeFlashTexture, []);
  const shockTex = useMemo(makeShockTexture, []);

  const flashRefs = useRef<(Sprite | null)[]>([]);
  const shockRefs = useRef<(Sprite | null)[]>([]);
  const flashSlots = useRef<Slot[]>(makeSlots(POOL_FLASH));
  const shockSlots = useRef<Slot[]>(makeSlots(POOL_SHOCK));

  useEffect(
    () => () => {
      flashTex.dispose();
      shockTex.dispose();
    },
    [flashTex, shockTex],
  );

  useFrame((_, delta) => {
    const flashes = flashSlots.current;
    const shocks = shockSlots.current;

    if (activeScenarioId) {
      for (const fx of drainImpactFx()) {
        const slots = fx.kind === "flash" ? flashes : shocks;
        const refs = fx.kind === "flash" ? flashRefs.current : shockRefs.current;
        const index = slots.findIndex((s) => !s.active);
        if (index < 0) {
          continue; // pool full — drop this cosmetic event
        }
        const slot = slots[index];
        slot.active = true;
        slot.age = 0;
        slot.pos = scaleVectorFromSun(fx.posKm, mode);
        slot.size = Math.max(scaleDistanceFromSun(fx.scaleKm, mode), 0.08);
        const sprite = refs[index];
        if (sprite) {
          (sprite.material as SpriteMaterial).color.set(fx.color);
        }
      }
    }

    const step = (slots: Slot[], refs: (Sprite | null)[], life: number, grow: number, fade: number) => {
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        const sprite = refs[i];
        if (!sprite) {
          continue;
        }
        if (!slot.active) {
          sprite.visible = false;
          continue;
        }
        slot.age += delta;
        const t = slot.age / life;
        if (t >= 1) {
          slot.active = false;
          sprite.visible = false;
          continue;
        }
        sprite.visible = true;
        sprite.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
        // Ease-out growth; opacity fades as a soft tail.
        const scale = slot.size * (0.5 + grow * (1 - (1 - t) * (1 - t)));
        sprite.scale.set(scale, scale, 1);
        (sprite.material as SpriteMaterial).opacity = fade * (1 - t) * (1 - t);
      }
    };

    step(flashes, flashRefs.current, FLASH_LIFE, 4.5, 1);
    step(shocks, shockRefs.current, SHOCK_LIFE, 13, 0.85);
  });

  return (
    <group>
      {Array.from({ length: POOL_FLASH }, (_, i) => (
        <sprite
          key={`flash-${i}`}
          ref={(node) => {
            flashRefs.current[i] = node;
          }}
          visible={false}
        >
          <spriteMaterial
            map={flashTex}
            blending={AdditiveBlending}
            depthWrite={false}
            transparent
            toneMapped={false}
            color={new Color("#fff0c8")}
          />
        </sprite>
      ))}
      {Array.from({ length: POOL_SHOCK }, (_, i) => (
        <sprite
          key={`shock-${i}`}
          ref={(node) => {
            shockRefs.current[i] = node;
          }}
          visible={false}
        >
          <spriteMaterial
            map={shockTex}
            blending={AdditiveBlending}
            depthWrite={false}
            transparent
            toneMapped={false}
            color={new Color("#ffd9a8")}
          />
        </sprite>
      ))}
    </group>
  );
};
