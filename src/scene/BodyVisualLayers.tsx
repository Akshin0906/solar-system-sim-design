import type { RefObject } from "react";
import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  type Group,
  type IUniform,
  type Mesh,
  type MeshStandardMaterial,
  type Sprite,
  type Texture,
} from "three";
import type { CelestialBody } from "../simulation/orbitalElements";
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  solarProgramCacheKey,
  type BodyRingConfig,
} from "./bodyPresentationResources";
import {
  createRingMaterialUniforms,
  ringFragmentShader,
  ringVertexShader,
} from "./materials/ringMaterial";
import type { getVisualProfile } from "./planetVisuals";
import type { SphereLodGeometrySet } from "./renderQuality";

type BodyVisualProfile = ReturnType<typeof getVisualProfile>;
type SolarMaterialPatch = (shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0]) => void;
type RingUniforms = ReturnType<typeof createRingMaterialUniforms>;

type BodyVisualLayersProps = {
  body: CelestialBody;
  selected: boolean;
  tiltRad: number;
  renderRadius: number;
  cloudRadius: number;
  atmosphereRadius: number;
  selectionRingRadius: number;
  selectionTubeRadius: number;
  emphasisOpacity: number;
  isTransparent: boolean;
  visual: BodyVisualProfile;
  lodGeometries: SphereLodGeometrySet;
  coronaTexture: Texture | null;
  impostorTexture: Texture | null;
  surfaceTexture: Texture | undefined;
  bumpTexture: Texture | undefined;
  roughnessTexture: Texture | undefined;
  cloudTexture: Texture | undefined;
  atmosphereUniforms: Record<string, IUniform> | undefined;
  ringConfig: BodyRingConfig | undefined;
  ringUniforms: RingUniforms;
  patchSolarMaterial: SolarMaterialPatch;
  detailRef: RefObject<Group | null>;
  meshRef: RefObject<Mesh | null>;
  cloudRef: RefObject<Mesh | null>;
  impostorRef: RefObject<Sprite | null>;
  selectionCueRef: RefObject<Group | null>;
};

export const BodyVisualLayers = ({
  body,
  selected,
  tiltRad,
  renderRadius,
  cloudRadius,
  atmosphereRadius,
  selectionRingRadius,
  selectionTubeRadius,
  emphasisOpacity,
  isTransparent,
  visual,
  lodGeometries,
  coronaTexture,
  impostorTexture,
  surfaceTexture,
  bumpTexture,
  roughnessTexture,
  cloudTexture,
  atmosphereUniforms,
  ringConfig,
  ringUniforms,
  patchSolarMaterial,
  detailRef,
  meshRef,
  cloudRef,
  impostorRef,
  selectionCueRef,
}: BodyVisualLayersProps) => (
  <>
    {body.type === "star" && (
      <sprite scale={[renderRadius * 5.2, renderRadius * 5.2, 1]}>
        <spriteMaterial
          map={coronaTexture}
          color="#ffd08a"
          transparent
          opacity={0.95 * emphasisOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    )}
    {body.type !== "star" && (
      <sprite ref={impostorRef} visible={!selected} scale={[renderRadius * 2.1, renderRadius * 2.1, 1]}>
        <spriteMaterial
          map={impostorTexture}
          color={visual.baseColor}
          transparent
          opacity={emphasisOpacity}
          alphaTest={0.08}
          depthWrite={false}
        />
      </sprite>
    )}
    <group ref={detailRef} rotation={[0, 0, tiltRad]} visible={selected || body.type === "star"}>
      {/* Keep the declarative geometry stable. BodyMesh owns LOD imperatively; tying
          this prop to selection lets a React commit overwrite a still-valid high LOD
          immediately after deselection. */}
      <mesh ref={meshRef} geometry={lodGeometries.low} scale={renderRadius}>
        {body.type === "star" ? (
          <meshBasicMaterial
            key="surface-material"
            map={surfaceTexture}
            color={surfaceTexture ? visual.baseColor : "#ffd08a"}
            toneMapped={false}
            transparent={isTransparent}
            opacity={emphasisOpacity}
          />
        ) : (
          <meshStandardMaterial
            key="surface-material"
            map={surfaceTexture}
            color={surfaceTexture ? "#ffffff" : visual.baseColor}
            roughness={visual.roughness}
            metalness={visual.metalness ?? 0.015}
            bumpMap={bumpTexture}
            bumpScale={(visual.bumpScale ?? 0) * emphasisOpacity}
            roughnessMap={roughnessTexture}
            emissive={visual.emissive ?? (body.type === "dwarfPlanet" ? "#080806" : "#000000")}
            transparent={isTransparent}
            opacity={emphasisOpacity}
            depthWrite={!isTransparent}
            onBeforeCompile={patchSolarMaterial}
            customProgramCacheKey={solarProgramCacheKey}
          />
        )}
      </mesh>
      {cloudTexture && (
        <mesh ref={cloudRef}>
          <sphereGeometry args={[cloudRadius, 48, 32]} />
          <meshStandardMaterial
            map={cloudTexture}
            color="#ffffff"
            roughness={0.92}
            transparent
            opacity={(visual.cloudOpacity ?? 0.16) * emphasisOpacity}
            depthWrite={false}
            alphaTest={0.02}
            onBeforeCompile={patchSolarMaterial}
            customProgramCacheKey={solarProgramCacheKey}
          />
        </mesh>
      )}
      {visual.atmosphereColor && atmosphereUniforms && (
        <mesh>
          <sphereGeometry args={[atmosphereRadius, 64, 40]} />
          <shaderMaterial
            uniforms={atmosphereUniforms}
            vertexShader={ATMOSPHERE_VERTEX_SHADER}
            fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
            transparent
            side={BackSide}
            blending={AdditiveBlending}
            depthWrite={false}
            fog
          />
        </mesh>
      )}
      {ringConfig && (
        <mesh rotation={[Math.PI / 2, 0, ringConfig.rotationZ]}>
          <ringGeometry args={[renderRadius * ringConfig.innerRadius, renderRadius * ringConfig.outerRadius, 192, 3]} />
          <shaderMaterial
            uniforms={ringUniforms}
            vertexShader={ringVertexShader}
            fragmentShader={ringFragmentShader}
            side={DoubleSide}
            transparent
            depthWrite={false}
            fog
          />
        </mesh>
      )}
    </group>
    {selected && (
      <group ref={selectionCueRef}>
        <mesh renderOrder={12}>
          <torusGeometry args={[selectionRingRadius, selectionTubeRadius, 6, 96]} />
          <meshBasicMaterial
            color="#f3dfb6"
            transparent
            opacity={0.5}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    )}
  </>
);
