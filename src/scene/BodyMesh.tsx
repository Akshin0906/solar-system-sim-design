import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Group,
  type Mesh,
  type Texture,
} from "three";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { MIN_FIT_RADIUS, visualRadiusForBody } from "./cameraFraming";
import { BODY_LABEL_DISTANCE_FACTOR, SCENE_HTML_Z_INDEX_RANGE, getBodyLabelScale } from "./labelScaling";
import {
  createBodyBumpTexture,
  createCloudTexture,
  createRingTexture,
  createSurfaceTexture,
  getEmphasisOpacity,
  getVisualProfile,
  type BodyEmphasis,
} from "./planetVisuals";

type BodyMeshProps = {
  body: CelestialBody;
  dateMs: number;
  mode: ScaleMode;
  position: Vec3;
  selected: boolean;
  showLabel: boolean;
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

export const BodyMesh = memo(({ body, dateMs, mode, position, selected, showLabel, emphasis }: BodyMeshProps) => {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const cloudRef = useRef<Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const objectWorldPosition = useMemo(() => new Vector3(), []);
  const cameraWorldPosition = useMemo(() => new Vector3(), []);
  const focusBody = useSelectionStore((state) => state.focusBody);
  const radius = getBodySceneRadius(body, mode);
  const tiltRad = ((body.physical.axialTiltDeg ?? 0) * Math.PI) / 180;
  const visual = useMemo(() => getVisualProfile(body), [body]);
  const proceduralSurfaceTexture = useMemo(() => createSurfaceTexture(body), [body]);
  const imageSurfaceTexture = useBodyImageTexture(body.physical.texture);
  const surfaceTexture = imageSurfaceTexture ?? proceduralSurfaceTexture;
  const bumpTexture = useMemo(() => createBodyBumpTexture(body), [body]);
  const cloudTexture = useMemo(() => createCloudTexture(body), [body]);
  const emphasisOpacity = getEmphasisOpacity(emphasis);
  const isTransparent = emphasisOpacity < 1;
  const renderRadius = Math.max(radius, MIN_FIT_RADIUS);
  const visualRadius = visualRadiusForBody(body, renderRadius);
  const cloudRadius = renderRadius * 1.018;
  const atmosphereRadius = renderRadius * 1.11;
  const selectionRingRadius = visualRadius * 1.15;
  const selectionTubeRadius = Math.max(visualRadius * 0.018, MIN_FIT_RADIUS * 0.06);
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
  ]
    .filter(Boolean)
    .join(" ");

  useFrame(({ camera }) => {
    if (meshRef.current && body.physical.rotationPeriodHours) {
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
    focusBody(body.id);
  };

  return (
    <group ref={groupRef} position={position} onClick={handleClick}>
      {body.type === "star" && (
        <>
          <mesh>
            <sphereGeometry args={[renderRadius * 2.6, 48, 48]} />
            <meshBasicMaterial
              color="#f7b260"
              transparent
              opacity={0.08 * emphasisOpacity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[renderRadius * 1.55, 48, 48]} />
            <meshBasicMaterial
              color="#ffd08a"
              transparent
              opacity={0.14 * emphasisOpacity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <group rotation={[0, 0, tiltRad]}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[renderRadius, body.type === "moon" ? 40 : 64, body.type === "moon" ? 24 : 40]} />
          {body.type === "star" ? (
            <meshBasicMaterial
              map={surfaceTexture}
              color={visual.baseColor}
              toneMapped={false}
              transparent={isTransparent}
              opacity={emphasisOpacity}
            />
          ) : (
            <meshStandardMaterial
              map={surfaceTexture}
              color="#ffffff"
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
              opacity={0.025}
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
          className={labelClassName}
          style={labelStyle}
          onClick={(event) => {
            event.stopPropagation();
            focusBody(body.id);
          }}
        >
          {body.name}
        </Html>
      )}
    </group>
  );
});

BodyMesh.displayName = "BodyMesh";
