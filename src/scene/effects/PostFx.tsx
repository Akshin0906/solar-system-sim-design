import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useThree } from "@react-three/fiber";
import { KernelSize } from "postprocessing";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import { useIsMobile } from "../../ui/useMediaQuery";
import { combinedRenderQuality, useRenderQualityStore } from "../renderQuality";

// Per-scenario bloom intensity. The compact, luminous catastrophes — a black hole's
// accretion glow, impact flashes, a molten remnant — push bloom harder so they read as
// genuinely radiant; the quieter ones stay restrained.
const SCENARIO_BLOOM: Record<string, number> = {
  "rogue-blackhole": 1.5,
  impact: 1.35,
  collision: 1.35,
  "red-giant": 1.2,
  "rogue-mass": 1.05,
  freefall: 0.85,
};

// The scene's postprocessing pipeline. Always mounted: it gives the Sun and the additive
// glows a soft bloom and a gentle cinematic vignette. When a doomsday scenario is live the
// bloom is pushed harder (per scenario) so an accretion glow or impact flash reads as
// luminous. Bloom keys off luminanceThreshold, so only already-bright pixels (toneMapped:
// false star/effect materials) flare — lit planet surfaces stay crisp.
//
// Bloom is the costly pass, so on coarse-pointer / narrow (mobile) devices it degrades:
// a smaller blur kernel, lower intensity, and no MSAA, to hold frame rate when fragment
// counts and additive layers rise.
export const PostFx = () => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const isMobile = useIsMobile();
  const interactionFactor = useThree((state) => state.performance.current);
  const measuredFactor = useRenderQualityStore((state) => state.measuredFactor);
  const performanceFactor = combinedRenderQuality(interactionFactor, measuredFactor);
  const underLoad = performanceFactor < 0.8;

  const base = activeScenarioId ? (SCENARIO_BLOOM[activeScenarioId] ?? 1.15) : 0.55;
  const intensity = base * (isMobile ? 0.7 : 1) * (underLoad ? 0.82 : 1);

  return (
    <EffectComposer multisampling={isMobile || underLoad ? 0 : 2}>
      <Bloom
        mipmapBlur={!underLoad}
        intensity={intensity}
        luminanceThreshold={activeScenarioId ? 0.6 : 0.72}
        luminanceSmoothing={0.22}
        radius={isMobile ? 0.7 : 0.78}
        kernelSize={isMobile || underLoad ? KernelSize.MEDIUM : KernelSize.LARGE}
      />
      <Vignette eskil={false} offset={0.28} darkness={0.52} />
    </EffectComposer>
  );
};
