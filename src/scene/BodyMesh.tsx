import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  LinearFilter,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Group,
  type Mesh,
  type Texture,
} from "three";
import type { CelestialBody } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { SCENE_HTML_Z_INDEX_RANGE } from "../ui/htmlLayering";
import { MIN_FIT_RADIUS, visualRadiusForBody } from "./cameraFraming";
import { BODY_LABEL_DISTANCE_FACTOR, getBodyLabelScale } from "./labelScaling";
import {
  createBodyBumpTexture,
  createCloudTexture,
  createRingTexture,
  createSurfaceTexture,
  getEmphasisOpacity,
  getVisualProfile,
  type BodyEmphasis,
} from "./planetVisuals";
import type { ScenePositionsRef } from "./scenePositions";

type BodyMeshProps = {
  body: CelestialBody;
  mode: ScaleMode;
  positionsRef: ScenePositionsRef;
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
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 glowColor;
  uniform float opacity;
  uniform float power;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDirection)), power);
    float fade = smoothstep(0.02, 0.88, rim);
    gl_FragColor = vec4(glowColor, fade * opacity);
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

const useBodyImageTexture = (url?: string) => {
  const [texture, setTexture] = useState<Texture>();

  useEffect(() => {
    setTexture(undefined);

    if (!url) {
      return undefined;
    }

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
        nextTexture.anisotropy = 4;
        nextTexture.wrapS = RepeatWrapping;
        nextTexture.wrapT = ClampToEdgeWrapping;
        setTexture(nextTexture);
      },
      undefined,
      () => {
        if (!disposed) {
          setTexture(undefined);
        }
      },
    );

    return () => {
      disposed = true;
      loadedTexture.dispose();
      setTexture(undefined);
    };
  }, [url]);

  return texture;
};

const useIdleTexture = (factory: () => Texture | undefined, dependencies: readonly unknown[]) => {
  const [texture, setTexture] = useState<Texture>();

  useEffect(() => {
    let disposed = false;
    setTexture(undefined);

    const load = () => {
      const nextTexture = factory();
      if (disposed) {
        nextTexture?.dispose();
        return;
      }
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
    };
    // The dependency list is intentionally supplied by the caller because these
    // texture factories are body-specific and expensive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return texture;
};

export const BodyMesh = memo(({ body, mode, positionsRef, selected, showLabel, labelSuppressed = false, emphasis }: BodyMeshProps) => {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const cloudRef = useRef<Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const labelButtonRef = useRef<HTMLButtonElement>(null);
  const detachLabelButtonRef = useRef<(() => void) | null>(null);
  const objectWorldPosition = useMemo(() => new Vector3(), []);
  const cameraWorldPosition = useMemo(() => new Vector3(), []);
  const selectBody = useSelectionStore((state) => state.selectBody);
  const radius = getBodySceneRadius(body, mode);
  const tiltRad = ((body.physical.axialTiltDeg ?? 0) * Math.PI) / 180;
  const visual = useMemo(() => getVisualProfile(body), [body]);
  const coronaTexture = useMemo(() => createCoronaTexture(), []);
  const proceduralSurfaceTexture = useIdleTexture(() => createSurfaceTexture(body), [body]);
  const imageSurfaceTexture = useBodyImageTexture(body.physical.texture);
  const surfaceTexture = imageSurfaceTexture ?? proceduralSurfaceTexture;
  const bumpTexture = useIdleTexture(() => createBodyBumpTexture(body), [body]);
  const cloudTexture = useIdleTexture(() => createCloudTexture(body), [body]);
  const emphasisOpacity = getEmphasisOpacity(emphasis);
  const isTransparent = emphasisOpacity < 1;
  const renderRadius = Math.max(radius, MIN_FIT_RADIUS);
  const visualRadius = visualRadiusForBody(body, renderRadius);
  const cloudRadius = renderRadius * 1.018;
  const atmosphereRadius = renderRadius * 1.11;
  const selectionRingRadius = visualRadius * 1.15;
  const selectionTubeRadius = Math.max(visualRadius * 0.036, MIN_FIT_RADIUS * 0.09);
  const selectionHaloRadius = visualRadius * 1.34;
  const labelOffset = visualRadius * 1.45;
  const ringConfig = ringConfigById[body.id as keyof typeof ringConfigById];
  const ringTexture = useMemo(
    () => (ringConfig ? createRingTexture(body, ringConfig.innerRadius / ringConfig.outerRadius) : undefined),
    [body, ringConfig],
  );
  const atmosphereUniforms = useMemo(
    () =>
      visual.atmosphereColor
        ? {
            glowColor: { value: new Color(visual.atmosphereColor) },
            opacity: { value: (visual.atmosphereOpacity ?? 0.12) * emphasisOpacity },
            power: { value: body.id === "earth" ? 2.55 : 2.25 },
          }
        : undefined,
    [body.id, emphasisOpacity, visual.atmosphereColor, visual.atmosphereOpacity],
  );
  const labelClassName = [
    "body-label",
    selected ? "selected" : "",
    emphasis === "muted" ? "quiet-label" : "",
    emphasis === "related" ? "related-label" : "",
    labelSuppressed && !selected ? "suppressed-label" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => () => proceduralSurfaceTexture?.dispose(), [proceduralSurfaceTexture]);
  useEffect(() => () => bumpTexture?.dispose(), [bumpTexture]);
  useEffect(() => () => cloudTexture?.dispose(), [cloudTexture]);
  useEffect(() => () => ringTexture?.dispose(), [ringTexture]);
  useEffect(() => () => coronaTexture.dispose(), [coronaTexture]);

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
      button.addEventListener("keydown", selectFromKeyboard, true);
      detachLabelButtonRef.current = () => {
        stoppedEvents.forEach((eventName) => button.removeEventListener(eventName, stop, true));
        button.removeEventListener("click", select, true);
        button.removeEventListener("keydown", selectFromKeyboard, true);
      };
    },
    [body.id, selectBody],
  );

  useEffect(() => () => detachLabelButtonRef.current?.(), []);

  useFrame(({ camera }) => {
    const position = positionsRef.current[body.id];
    if (position && groupRef.current) {
      groupRef.current.position.set(position[0], position[1], position[2]);
    }

    if (meshRef.current && body.physical.rotationPeriodHours) {
      const dateMs = useTimeStore.getState().simulationDateMs;
      const rotationMs = Math.abs(body.physical.rotationPeriodHours) * 3_600_000;
      const direction = body.physical.rotationPeriodHours < 0 ? -1 : 1;
      meshRef.current.rotation.y = direction * ((dateMs % rotationMs) / rotationMs) * Math.PI * 2;

      if (cloudRef.current) {
        cloudRef.current.rotation.y = meshRef.current.rotation.y * 1.08 + 0.22;
      }
    }

    if (!labelRef.current || !groupRef.current) {
      return;
    }

    groupRef.current.getWorldPosition(objectWorldPosition);
    camera.getWorldPosition(cameraWorldPosition);
    const cameraFovDeg = camera instanceof PerspectiveCamera ? camera.fov : undefined;
    const labelScale = getBodyLabelScale(mode, objectWorldPosition.distanceTo(cameraWorldPosition), cameraFovDeg).toFixed(4);

    if (labelRef.current.style.getPropertyValue("--body-label-scale") !== labelScale) {
      labelRef.current.style.setProperty("--body-label-scale", labelScale);
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    selectBody(body.id);
  };

  return (
    <group ref={groupRef} onClick={handleClick}>
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
      <group rotation={[0, 0, tiltRad]}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[renderRadius, body.type === "moon" ? 40 : 64, body.type === "moon" ? 24 : 40]} />
          {body.type === "star" ? (
            <meshBasicMaterial
              map={surfaceTexture}
              color={surfaceTexture ? visual.baseColor : "#ffd08a"}
              toneMapped={false}
              transparent={isTransparent}
              opacity={emphasisOpacity}
            />
          ) : (
            <meshStandardMaterial
              map={surfaceTexture}
              color={surfaceTexture ? "#ffffff" : visual.baseColor}
              roughness={visual.roughness}
              metalness={visual.metalness ?? 0.015}
              bumpMap={bumpTexture}
              bumpScale={(visual.bumpScale ?? 0) * emphasisOpacity}
              roughnessMap={bumpTexture}
              emissive={visual.emissive ?? (body.type === "dwarfPlanet" ? "#080806" : "#000000")}
              transparent={isTransparent}
              opacity={emphasisOpacity}
              depthWrite={!isTransparent}
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
            />
          </mesh>
        )}
        {ringConfig && (
          <mesh rotation={[Math.PI / 2, 0, ringConfig.rotationZ]}>
            <ringGeometry args={[renderRadius * ringConfig.innerRadius, renderRadius * ringConfig.outerRadius, 192, 3]} />
            <meshStandardMaterial
              map={ringTexture}
              color="#ffffff"
              side={DoubleSide}
              transparent
              opacity={ringConfig.opacity * emphasisOpacity}
              roughness={0.94}
              metalness={0.02}
              alphaTest={0.015}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {selected && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[selectionRingRadius, selectionTubeRadius * 0.62, 8, 128]} />
            <meshBasicMaterial color="#f3dfb6" transparent opacity={0.62} depthWrite={false} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[selectionRingRadius * 1.015, selectionTubeRadius * 0.42, 8, 128]} />
            <meshBasicMaterial color="#f3dfb6" transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <torusGeometry args={[selectionRingRadius * 1.015, selectionTubeRadius * 0.42, 8, 128]} />
            <meshBasicMaterial color="#f3dfb6" transparent opacity={0.2} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[selectionHaloRadius, 48, 28]} />
            <meshBasicMaterial
              color="#f1dfb8"
              transparent
              opacity={0.07}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
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
            tabIndex={labelSuppressed && !selected ? -1 : 0}
            aria-hidden={labelSuppressed && !selected ? "true" : undefined}
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
