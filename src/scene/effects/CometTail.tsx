import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, type Sprite } from "three";
import { IMPACTOR_ID } from "../../scenarios/registry";
import { getParticipant } from "../../scenarios/scenarioRuntime";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import { scaleVectorFromSun, type ScaleMode } from "../../simulation/units";

const PUFFS = 7; // sprites making up the coma + tail

const makeGlowTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(220,240,255,0.95)");
  g.addColorStop(0.4, "rgba(180,220,255,0.4)");
  g.addColorStop(1, "rgba(150,200,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

// The comet's coma + ion tail: a string of additive glows blown anti-sunward from the
// nucleus. Tracks the injected impactor like the Interloper overlay; renders nothing for an
// asteroid impactor. The tail always points directly away from the Sun (at the origin).
export const CometTail = ({ mode }: { mode: ScaleMode }) => {
  const isComet = useScenarioStore((state) => (state.params.impactorType ?? 0) === 1);
  const tex = useMemo(makeGlowTexture, []);
  const puffRefs = useRef<(Sprite | null)[]>([]);

  useEffect(() => () => tex.dispose(), [tex]);

  useFrame(() => {
    const comet = getParticipant(IMPACTOR_ID);
    const refs = puffRefs.current;
    if (!isComet || !comet || !comet.alive) {
      for (const sprite of refs) {
        if (sprite) sprite.visible = false;
      }
      return;
    }
    const [x, y, z] = scaleVectorFromSun(comet.posKm, mode);
    // Anti-sun direction in scene space (the Sun sits at the origin).
    const len = Math.hypot(x, y, z) || 1;
    const ax = x / len;
    const ay = y / len;
    const az = z / len;
    const spacing = 0.35;
    for (let i = 0; i < refs.length; i += 1) {
      const sprite = refs[i];
      if (!sprite) continue;
      sprite.visible = true;
      const along = i * spacing;
      sprite.position.set(x + ax * along, y + ay * along, z + az * along);
      // Coma is brightest/smallest at the nucleus, swelling and fading down the tail.
      const t = i / PUFFS;
      const scale = 0.45 + t * 1.4;
      sprite.scale.set(scale, scale, 1);
      (sprite.material as { opacity: number }).opacity = (1 - t) * 0.8;
    }
  });

  return (
    <group>
      {Array.from({ length: PUFFS }, (_, i) => (
        <sprite
          key={`puff-${i}`}
          ref={(node) => {
            puffRefs.current[i] = node;
          }}
          visible={false}
        >
          <spriteMaterial map={tex} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
};
