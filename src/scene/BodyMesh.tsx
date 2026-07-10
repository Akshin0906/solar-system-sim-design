import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Sprite,
  type Texture,
} from "three";
import type { CelestialBody } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { getBodyOrientationAxes } from "../simulation/orientation";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { SCENE_HTML_Z_INDEX_RANGE } from "../ui/htmlLayering";
import { MIN_FIT_RADIUS, visualRadiusForBody } from "./cameraFraming";
import { BODY_LABEL_DISTANCE_FACTOR, getBodyLabelScale } from "./labelScaling";
import {
  createBodyBumpTexture,
  createBodyRoughnessTexture,
  createCloudTexture,
  createImageDerivedRoughnessTexture,
  createRingTexture,
  createSurfaceTexture,
  configurePlanetTexture,
  getEmphasisOpacity,
  getVisualProfile,
  type BodyEmphasis,
} from "./planetVisuals";
import type { ScenePositionsRef } from "./scenePositions";
import {
  createSphereLodGeometries,
  disposeSphereLodGeometries,
  projectedSphereRadiusPx,
  resolveSphereLod,
  combinedRenderQuality,
  useRenderQualityStore,
  type SphereLodLevel,
} from "./renderQuality";
import {
  createSolarLightingUniforms,
  patchSolarLitMaterial,
  SOLAR_LIT_PROGRAM_KEY,
  updateSolarLightingUniforms,
} from "./materials/solarLighting";
import {
  createRingMaterialUniforms,
  ringFragmentShader,
  ringVertexShader,
  updateRingMaterialUniforms,
} from "./materials/ringMaterial";

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

const ringConfigById = {
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
} as const;

const labelStyle = {
  transform: "translate3d(-50%, -50%, 0) scale(var(--body-label-scale, 1))",
  transformOrigin: "center center",
};

const atmosphereVertexShader = `
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

const atmosphereFragmentShader = `
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

const createCoronaTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(96, 96, 8, 96, 96, 96);
    gradient.addColorStop(0, "rgba(255, 224, 166, 0.32)");
    gradient.addColorStop(0.34, "rgba(247, 178, 96, 0.18)");
    gradient.addColorStop(0.7, "rgba(247, 178, 96, 0.055)");
    gradient.addColorStop(1, "rgba(247, 178, 96, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
};

const createImpostorDiscTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(19, 16, 1, 24, 24, 22);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.72, "rgba(226, 231, 238, 1)");
    gradient.addColorStop(0.92, "rgba(92, 101, 116, 0.92)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
};

const configureOptionalTexture = (
  texture: Texture | undefined,
  maxAnisotropy: number,
  repeatHorizontally = true,
) => texture ? configurePlanetTexture(texture, maxAnisotropy, repeatHorizontally) : undefined;

const solarProgramCacheKey = () => SOLAR_LIT_PROGRAM_KEY;

type BodyImageTextureState = {
  texture?: Texture;
  status: "unavailable" | "loading" | "loaded" | "failed";
};

const useBodyImageTexture = (url: string | undefined, maxAnisotropy: number) => {
  const [state, setState] = useState<BodyImageTextureState>(() => ({
    status: url ? "loading" : "unavailable",
  }));

  useEffect(() => {
    if (!url) {
      setState({ status: "unavailable" });
      return undefined;
    }

    setState({ status: "loading" });
    let disposed = false;
    const loader = new TextureLoader();
    const loadedTexture = loader.load(
      url,
      (nextTexture) => {
        if (disposed) {
          nextTexture.dispose();
          return;
        }

        nextTexture.colorSpace = SRGBColorSpace;
        configurePlanetTexture(nextTexture, maxAnisotropy);
        setState({ status: "loaded", texture: nextTexture });
      },
      undefined,
      () => {
        if (!disposed) {
          setState({ status: "failed" });
        }
      },
    );

    return () => {
      disposed = true;
      loadedTexture.dispose();
    };
  }, [maxAnisotropy, url]);

  return state;
};

const useIdleTexture = (factory: () => Texture | undefined, dependencies: readonly unknown[]) => {
  const [texture, setTexture] = useState<Texture>();

  useEffect(() => {
    let disposed = false;
    let createdTexture: Texture | undefined;
    setTexture(undefined);

    const load = () => {
      const nextTexture = factory();
      if (disposed) {
        nextTexture?.dispose();
        return;
      }
      createdTexture = nextTexture;
      setTexture(nextTexture);
    };

    const canRequestIdle =
      typeof window !== "undefined" &&
      "requestIdleCallback" in window &&
      typeof window.requestIdleCallback === "function";
    const idleId = canRequestIdle ? window.requestIdleCallback(load, { timeout: 700 }) : undefined;
    const timeoutId = canRequestIdle ? undefined : window.setTimeout(load, 0);

    return () => {
      disposed = true;
      if (idleId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      } else if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      createdTexture?.dispose();
    };
    // The dependency list is intentionally supplied by the caller because these
    // texture factories are body-specific and expensive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return texture;
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
  const labelButtonRef = useRef<HTMLButtonElement>(null);
  const detachLabelButtonRef = useRef<(() => void) | null>(null);
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
  const selectBody = useSelectionStore((state) => state.selectBody);
  const focusBody = useSelectionStore((state) => state.focusBody);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const interactionQualityFactor = useThree((state) => state.performance.current);
  const measuredQualityFactor = useRenderQualityStore((state) => state.measuredFactor);
  const qualityFactor = combinedRenderQuality(interactionQualityFactor, measuredQualityFactor);
  const radius = getBodySceneRadius(body, mode);
  const tiltRad = ((body.physical.axialTiltDeg ?? 0) * Math.PI) / 180;
  const visual = useMemo(() => getVisualProfile(body), [body]);
  const lodGeometries = useMemo(() => createSphereLodGeometries(body.type === "moon"), [body.type]);
  // Only stars render a corona sprite, so only build (and rasterize) the texture for them
  // — previously every body allocated a 192² CanvasTexture that nothing but the Sun used.
  const coronaTexture = useMemo(() => (body.type === "star" ? createCoronaTexture() : null), [body.type]);
  const impostorTexture = useMemo(() => (body.type === "star" ? null : createImpostorDiscTexture()), [body.type]);
  const imageSurface = useBodyImageTexture(body.physical.texture, maxAnisotropy);
  const proceduralSurfaceTexture = useIdleTexture(
    () =>
      imageSurface.status === "unavailable" || imageSurface.status === "failed"
        ? configureOptionalTexture(createSurfaceTexture(body), maxAnisotropy)
        : undefined,
    [body, imageSurface.status, maxAnisotropy],
  );
  const surfaceTexture = imageSurface.texture ?? proceduralSurfaceTexture;
  const useProceduralMaterialChannels = imageSurface.status === "unavailable" || imageSurface.status === "failed";
  const bumpTexture = useIdleTexture(
    () => useProceduralMaterialChannels ? configureOptionalTexture(createBodyBumpTexture(body), maxAnisotropy) : undefined,
    [body, maxAnisotropy, useProceduralMaterialChannels],
  );
  const roughnessTexture = useIdleTexture(
    () => {
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
    [body, imageSurface.texture, maxAnisotropy, useProceduralMaterialChannels],
  );
  const cloudTexture = useIdleTexture(
    () => configureOptionalTexture(createCloudTexture(body), maxAnisotropy),
    [body, maxAnisotropy],
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
  const ringConfig = ringConfigById[body.id as keyof typeof ringConfigById];
  const ringTexture = useMemo(
    () => ringConfig
      ? configureOptionalTexture(createRingTexture(body, ringConfig.innerRadius / ringConfig.outerRadius), maxAnisotropy, false)
      : undefined,
    [body, maxAnisotropy, ringConfig],
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
  const labelClassName = [
    "body-label",
    selected ? "selected" : "",
    emphasis === "muted" ? "quiet-label" : "",
    emphasis === "related" ? "related-label" : "",
    labelSuppressed ? "suppressed-label" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => () => ringTexture?.dispose(), [ringTexture]);
  useEffect(() => () => coronaTexture?.dispose(), [coronaTexture]);
  useEffect(() => () => impostorTexture?.dispose(), [impostorTexture]);
  useEffect(() => () => disposeSphereLodGeometries(lodGeometries), [lodGeometries]);

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

  const attachLabelButton = useCallback(
    (button: HTMLButtonElement | null) => {
      detachLabelButtonRef.current?.();
      detachLabelButtonRef.current = null;
      labelButtonRef.current = button;

      if (!button) {
        return;
      }

      const stop = (event: Event) => {
        event.stopPropagation();
      };
      const select = (event: Event) => {
        stop(event);
        selectBody(body.id);
      };
      const focus = (event: Event) => {
        stop(event);
        focusBody(body.id);
      };
      const selectFromKeyboard = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        select(event);
      };
      const stoppedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "dblclick"];

      stoppedEvents.forEach((eventName) => button.addEventListener(eventName, stop, true));
      button.addEventListener("click", select, true);
      button.addEventListener("dblclick", focus, true);
      button.addEventListener("keydown", selectFromKeyboard, true);
      detachLabelButtonRef.current = () => {
        stoppedEvents.forEach((eventName) => button.removeEventListener(eventName, stop, true));
        button.removeEventListener("click", select, true);
        button.removeEventListener("dblclick", focus, true);
        button.removeEventListener("keydown", selectFromKeyboard, true);
      };
    },
    [body.id, focusBody, selectBody],
  );

  useEffect(() => () => detachLabelButtonRef.current?.(), []);

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

      if (nextLod !== currentLodRef.current) {
        currentLodRef.current = nextLod;
        if (detailRef.current) {
          detailRef.current.visible = nextLod !== "impostor";
        }
        if (impostorRef.current) {
          impostorRef.current.visible = nextLod === "impostor";
        }
        if (meshRef.current && nextLod !== "impostor") {
          meshRef.current.geometry = lodGeometries[nextLod];
        }
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
        <sprite ref={impostorRef} visible={false} scale={[renderRadius * 2.1, renderRadius * 2.1, 1]}>
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
      <group ref={detailRef} rotation={[0, 0, tiltRad]}>
        <mesh ref={meshRef} geometry={lodGeometries.high} scale={renderRadius}>
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
              vertexShader={atmosphereVertexShader}
              fragmentShader={atmosphereFragmentShader}
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
      {showLabel && (
        <Html
          ref={labelRef}
          position={[0, labelOffset, 0]}
          center
          distanceFactor={mode === "real" ? undefined : BODY_LABEL_DISTANCE_FACTOR}
          zIndexRange={SCENE_HTML_Z_INDEX_RANGE}
          className="body-label-anchor"
          style={labelStyle}
        >
          <button
            ref={attachLabelButton}
            className={labelClassName}
            type="button"
            // Labels stay mouse/click-selectable but are kept OUT of the keyboard tab
            // order: otherwise ~14 tiny, arbitrarily-positioned scene buttons sit ahead
            // of the toolbar in an order unrelated to visual layout. Keyboard selection
            // is handled by the command palette instead.
            tabIndex={-1}
            aria-hidden={labelSuppressed ? "true" : undefined}
            aria-label={`Select ${body.name}`}
            data-body-id={body.id}
          >
            {body.name}
          </button>
        </Html>
      )}
    </group>
  );
});

BodyMesh.displayName = "BodyMesh";
