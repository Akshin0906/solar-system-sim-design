import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { useScenarioStore } from "../../scenarios/scenarioStore";

// The scene's postprocessing pipeline. Always mounted: it gives the Sun and the
// additive glows a soft bloom and a gentle cinematic vignette. When a doomsday
// scenario is live the bloom is pushed harder so a red giant or an accretion glow
// reads as genuinely luminous rather than just a bright disc.
//
// Bloom keys off luminanceThreshold, so only already-bright pixels (the toneMapped:false
// star materials and additive coronae) flare — lit planet surfaces stay crisp.
export const PostFx = () => {
  const scenarioActive = useScenarioStore((state) => state.activeScenarioId !== null);

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={scenarioActive ? 1.15 : 0.55}
        luminanceThreshold={scenarioActive ? 0.6 : 0.72}
        luminanceSmoothing={0.22}
        radius={0.78}
        kernelSize={KernelSize.LARGE}
      />
      <Vignette eskil={false} offset={0.28} darkness={0.52} />
    </EffectComposer>
  );
};
