import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Sprite,
} from "three";
import type { CelestialBody } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { getBodyOrientationAxes } from "../simulation/orientation";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { BodyLabel, useBodyLabelButton } from "./BodyLabel";
import { BodyVisualLayers } from "./BodyVisualLayers";
import { BODY_RING_CONFIG_BY_ID } from "./bodyPresentationResources";
import { MIN_FIT_RADIUS, visualRadiusForBody } from "./cameraFraming";
import { getBodyLabelScale } from "./labelScaling";
import {
  createBodyBumpTexture,
  createBodyRoughnessTexture,
  createCloudTexture,
  createImageDerivedRoughnessTexture,
  createRingTexture,
  createSurfaceTexture,
  getEmphasisOpacity,
  getVisualProfile,
  type BodyEmphasis,
} from "./planetVisuals";
import {
  configureOptionalTexture,
  createCoronaTexture,
  getSharedImpostorDiscTexture,
  useBodyImageTexture,
  useIdleTexture,
} from "./bodyTextureLifecycle";
import type { ScenePositionsRef } from "./scenePositions";
import {
  getSharedSphereLodGeometries,
  projectedSphereRadiusPx,
  resolveSphereLod,
  combinedRenderQuality,
  useRenderQualityStore,
  type SphereLodLevel,
} from "./renderQuality";
import {
  createSolarLightingUniforms,
  patchSolarLitMaterial,
  updateSolarLightingUniforms,
} from "./materials/solarLighting";
import { createRingMaterialUniforms, updateRingMaterialUniforms } from "./materials/ringMaterial";

type BodyMeshProps = {
  body: CelestialBody;
  mode: ScaleMode;
  positionsRef: ScenePositionsRef;
  eclipseOccluders?: CelestialBody[];
  selected: boolean;
  showLabel: boolean;
  labelSuppressed?: boolean;
  emphasis: BodyEmphasis;
};

export const BodyMesh = memo(({
  body,
  mode,
  positionsRef,
  eclipseOccluders = [],
  selected,
  showLabel,
  labelSuppressed = false,
  emphasis,
}: BodyMeshProps) => {
  const groupRef = useRef<Group>(null);
  const detailRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const cloudRef = useRef<Mesh>(null);
  const impostorRef = useRef<Sprite>(null);
  const selectionCueRef = useRef<Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const objectWorldPosition = useMemo(() => new Vector3(), []);
  const cameraWorldPosition = useMemo(() => new Vector3(), []);
  const orientationMatrix = useMemo(() => new Matrix4(), []);
  const orientationQuaternion = useMemo(() => new Quaternion(), []);
  const bodyXAxis = useMemo(() => new Vector3(), []);
  const bodyNorthAxis = useMemo(() => new Vector3(), []);
  const negativeBodyYAxis = useMemo(() => new Vector3(), []);
  const orientationDate = useMemo(() => new Date(), []);
  const lastLabelScaleRef = useRef(-1);
  const currentLodRef = useRef<SphereLodLevel | undefined>(undefined);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const wideCameraMode =
    cameraMode === "overview" ||
    cameraMode === "inner" ||
    cameraMode === "outer" ||
    cameraMode === "kuiper-belt";
  const imageTextureRequestedRef = useRef(selected && !wideCameraMode);
  if (selected && !wideCameraMode) {
    // Load bundled source imagery for a body only after it becomes relevant, then retain
    // it for instant return visits. Overview bodies remain useful calibrated color discs.
    imageTextureRequestedRef.current = true;
  }
  const textureDetailsRequestedRef = useRef(selected && !wideCameraMode);
  if (selected && !wideCameraMode) {
    // Generated relief/cloud/ring maps are close-inspection refinements. Once requested,
    // retain them if selection moves away so a return visit is instant.
    textureDetailsRequestedRef.current = true;
  }
  const hydrateTextureDetails = textureDetailsRequestedRef.current;
  const selectBody = useSelectionStore((state) => state.selectBody);
  const focusBody = useSelectionStore((state) => state.focusBody);
  const attachLabelButton = useBodyLabelButton(body.id, selectBody, focusBody);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const interactionQualityFactor = useThree((state) => state.performance.current);
  const measuredQualityFactor = useRenderQualityStore((state) => state.measuredFactor);
  const qualityFactor = combinedRenderQuality(interactionQualityFactor, measuredQualityFactor);
  const radius = getBodySceneRadius(body, mode);
  const tiltRad = ((body.physical.axialTiltDeg ?? 0) * Math.PI) / 180;
  const visual = useMemo(() => getVisualProfile(body), [body]);
  const lodGeometries = getSharedSphereLodGeometries(body.type === "moon");
  // Only stars render a corona sprite, so only build (and rasterize) the texture for them
  // — previously every body allocated a 192² CanvasTexture that nothing but the Sun used.
  const coronaTexture = useMemo(() => (body.type === "star" ? createCoronaTexture() : null), [body.type]);
  const impostorTexture = body.type === "star" ? null : getSharedImpostorDiscTexture();
  const imageSurface = useBodyImageTexture(body.physical.texture, maxAnisotropy, imageTextureRequestedRef.current);
  const needsProceduralSurface =
    hydrateTextureDetails && (imageSurface.status === "unavailable" || imageSurface.status === "failed");
  const proceduralSurfaceTexture = useIdleTexture(
    () => configureOptionalTexture(createSurfaceTexture(body), maxAnisotropy),
    [body, imageSurface.status, maxAnisotropy, needsProceduralSurface],
    needsProceduralSurface,
  );
  const surfaceTexture = imageSurface.texture ?? proceduralSurfaceTexture;
  const useProceduralMaterialChannels = imageSurface.status === "unavailable" || imageSurface.status === "failed";
  const bumpTexture = useIdleTexture(
    () => configureOptionalTexture(createBodyBumpTexture(body), maxAnisotropy),
    [body, hydrateTextureDetails, maxAnisotropy, useProceduralMaterialChannels],
    hydrateTextureDetails && useProceduralMaterialChannels && Boolean(visual.bumpScale),
  );
  const needsRoughnessTexture =
    hydrateTextureDetails &&
    ((body.id === "earth" && Boolean(imageSurface.texture?.image)) ||
      (useProceduralMaterialChannels && Boolean(visual.bumpScale) && body.type !== "star"));
  const roughnessTexture = useIdleTexture(
    () => {
      if (!hydrateTextureDetails) {
        return undefined;
      }
      if (imageSurface.texture?.image) {
        return configureOptionalTexture(
          createImageDerivedRoughnessTexture(body, imageSurface.texture.image as CanvasImageSource),
          maxAnisotropy,
        );
      }
      return useProceduralMaterialChannels
        ? configureOptionalTexture(createBodyRoughnessTexture(body), maxAnisotropy)
        : undefined;
    },
    [body, hydrateTextureDetails, imageSurface.texture, maxAnisotropy, needsRoughnessTexture, useProceduralMaterialChannels],
    needsRoughnessTexture,
  );
  const needsCloudTexture = hydrateTextureDetails && (body.id === "earth" || body.id === "venus");
  const cloudTexture = useIdleTexture(
    () => configureOptionalTexture(createCloudTexture(body), maxAnisotropy),
    [body, maxAnisotropy, needsCloudTexture],
    needsCloudTexture,
  );
  const emphasisOpacity = getEmphasisOpacity(emphasis);
  const isTransparent = emphasisOpacity < 1;
  const renderRadius = Math.max(radius, MIN_FIT_RADIUS);
  const visualRadius = visualRadiusForBody(body, renderRadius);
  const cloudRadius = renderRadius * 1.018;
  const atmosphereRadius = renderRadius * 1.11;
  const selectionRingRadius = visualRadius * 1.15;
  const selectionTubeRadius = Math.max(visualRadius * 0.014, MIN_FIT_RADIUS * 0.04);
  const labelOffset = visualRadius * 1.45;
  const ringConfig = BODY_RING_CONFIG_BY_ID[body.id as keyof typeof BODY_RING_CONFIG_BY_ID];
  const ringTexture = useIdleTexture(
    () => ringConfig
      ? configureOptionalTexture(createRingTexture(body, ringConfig.innerRadius / ringConfig.outerRadius), maxAnisotropy, false)
      : undefined,
    [body, hydrateTextureDetails, maxAnisotropy, ringConfig],
    hydrateTextureDetails && Boolean(ringConfig),
  );
  const solarLightingUniforms = useMemo(() => createSolarLightingUniforms(), []);
  const patchSolarMaterial = useCallback(
    (shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0]) => {
      patchSolarLitMaterial(shader, solarLightingUniforms);
    },
    [solarLightingUniforms],
  );
  const atmosphereUniforms = useMemo(
    () =>
      visual.atmosphereColor
        ? {
            ...UniformsUtils.clone(UniformsLib.fog),
            glowColor: { value: new Color(visual.atmosphereColor) },
            sunsetColor: { value: new Color(body.id === "earth" ? "#d99068" : "#e4b184") },
            solarPosition: solarLightingUniforms.solarPosition,
            opacity: { value: (visual.atmosphereOpacity ?? 0.12) * emphasisOpacity },
            power: { value: body.id === "earth" ? 2.55 : 2.25 },
          }
        : undefined,
    [body.id, emphasisOpacity, solarLightingUniforms.solarPosition, visual.atmosphereColor, visual.atmosphereOpacity],
  );
  const ringUniforms = useMemo(
    () => createRingMaterialUniforms(ringTexture, (ringConfig?.opacity ?? 0) * emphasisOpacity),
    [emphasisOpacity, ringConfig?.opacity, ringTexture],
  );
  useEffect(() => () => coronaTexture?.dispose(), [coronaTexture]);

  // The surface material is now kept mounted across async texture loads (stable key, not the
  // texture uuid) to avoid recreating + recompiling it every time a texture resolves. A material
  // only compiles in a map that appears (or disappears) after creation when its program is
  // rebuilt, so flag needsUpdate whenever the surface/bump textures change. Layout effect (not
  // passive) so the flag is set before the frame R3F already scheduled for the map change renders
  // — otherwise in frameloop="demand" the recompile could wait for an unrelated later invalidate.
  useLayoutEffect(() => {
    const material = meshRef.current?.material;
    if (material && !Array.isArray(material)) {
      material.needsUpdate = true;
    }
  }, [surfaceTexture, bumpTexture, roughnessTexture]);

  useFrame(({ camera, size }) => {
    const position = positionsRef.current[body.id];
    if (position && groupRef.current) {
      groupRef.current.position.set(position[0], position[1], position[2]);
    }

    updateSolarLightingUniforms(solarLightingUniforms, positionsRef.current, eclipseOccluders, mode);
    if (ringConfig) {
      updateRingMaterialUniforms(
        ringUniforms,
        positionsRef.current.sun,
        position,
        renderRadius,
        ringTexture,
        ringConfig.opacity * emphasisOpacity,
      );
    }

    const dateMs = useTimeStore.getState().simulationDateMs;
    orientationDate.setTime(dateMs);
    const orientation = getBodyOrientationAxes(body, orientationDate);
    if (orientation && detailRef.current) {
      bodyXAxis.set(...orientation.xAxis);
      bodyNorthAxis.set(...orientation.zAxis);
      negativeBodyYAxis.set(-orientation.yAxis[0], -orientation.yAxis[1], -orientation.yAxis[2]);
      orientationMatrix.makeBasis(bodyXAxis, bodyNorthAxis, negativeBodyYAxis);
      orientationQuaternion.setFromRotationMatrix(orientationMatrix);
      detailRef.current.quaternion.copy(orientationQuaternion);
      if (meshRef.current) {
        meshRef.current.rotation.y = 0;
      }
      if (cloudRef.current) {
        cloudRef.current.rotation.y = 0.22;
      }
    } else if (meshRef.current && body.physical.rotationPeriodHours) {
      const rotationMs = Math.abs(body.physical.rotationPeriodHours) * 3_600_000;
      const direction = body.physical.rotationPeriodHours < 0 ? -1 : 1;
      meshRef.current.rotation.y = direction * ((dateMs % rotationMs) / rotationMs) * Math.PI * 2;

      if (cloudRef.current) {
        cloudRef.current.rotation.y = meshRef.current.rotation.y * 1.08 + 0.22;
      }
    }

    if (groupRef.current) {
      groupRef.current.getWorldPosition(objectWorldPosition);
      camera.getWorldPosition(cameraWorldPosition);
      const cameraFovDeg = camera instanceof PerspectiveCamera ? camera.fov : 48;
      const projectedRadius = projectedSphereRadiusPx(
        visualRadius,
        objectWorldPosition.distanceTo(cameraWorldPosition),
        cameraFovDeg,
        size.height,
      );
      const nextLod = resolveSphereLod(
        projectedRadius,
        selected || body.type === "star",
        qualityFactor,
        currentLodRef.current,
      );

      currentLodRef.current = nextLod;
      if (
        meshRef.current &&
        nextLod !== "impostor" &&
        meshRef.current.geometry !== lodGeometries[nextLod]
      ) {
        meshRef.current.geometry = lodGeometries[nextLod];
      }

      // React can reapply the JSX `visible` defaults when selection, camera mode, or
      // measured quality changes even if the projected-size LOD itself did not cross a
      // threshold. Keep visibility authoritative every frame; only the more expensive
      // geometry swap is likewise guarded by resource identity above because a React
      // commit can reapply declarative props without changing the resolved LOD.
      if (detailRef.current) {
        detailRef.current.visible = nextLod !== "impostor";
      }
      if (impostorRef.current) {
        impostorRef.current.visible = nextLod === "impostor";
      }
    }

    if (selectionCueRef.current) {
      selectionCueRef.current.quaternion.copy(camera.quaternion);
    }

    if (!labelRef.current || !groupRef.current) {
      return;
    }

    groupRef.current.getWorldPosition(objectWorldPosition);
    camera.getWorldPosition(cameraWorldPosition);
    const cameraFovDeg = camera instanceof PerspectiveCamera ? camera.fov : undefined;
    const labelScale = getBodyLabelScale(mode, objectWorldPosition.distanceTo(cameraWorldPosition), cameraFovDeg);

    // Only touch the DOM (and allocate the toFixed string) when the scale actually
    // moves past the 4-decimal threshold the style var is written at.
    if (Math.abs(labelScale - lastLabelScaleRef.current) > 1e-4) {
      lastLabelScaleRef.current = labelScale;
      labelRef.current.style.setProperty("--body-label-scale", labelScale.toFixed(4));
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    selectBody(body.id);
  };

  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    focusBody(body.id);
  };

  return (
    <group ref={groupRef} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      <BodyVisualLayers
        body={body}
        selected={selected}
        tiltRad={tiltRad}
        renderRadius={renderRadius}
        cloudRadius={cloudRadius}
        atmosphereRadius={atmosphereRadius}
        selectionRingRadius={selectionRingRadius}
        selectionTubeRadius={selectionTubeRadius}
        emphasisOpacity={emphasisOpacity}
        isTransparent={isTransparent}
        visual={visual}
        lodGeometries={lodGeometries}
        coronaTexture={coronaTexture}
        impostorTexture={impostorTexture}
        surfaceTexture={surfaceTexture}
        bumpTexture={bumpTexture}
        roughnessTexture={roughnessTexture}
        cloudTexture={cloudTexture}
        atmosphereUniforms={atmosphereUniforms}
        ringConfig={ringConfig}
        ringUniforms={ringUniforms}
        patchSolarMaterial={patchSolarMaterial}
        detailRef={detailRef}
        meshRef={meshRef}
        cloudRef={cloudRef}
        impostorRef={impostorRef}
        selectionCueRef={selectionCueRef}
      />
      {showLabel && (
        <BodyLabel
          bodyId={body.id}
          bodyName={body.name}
          mode={mode}
          offset={labelOffset}
          selected={selected}
          emphasis={emphasis}
          suppressed={labelSuppressed}
          labelRef={labelRef}
          attachButton={attachLabelButton}
        />
      )}
    </group>
  );
});

BodyMesh.displayName = "BodyMesh";
