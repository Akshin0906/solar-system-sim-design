import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CelestialBody, Vec3 } from "../simulation/orbitalElements";
import { useSelectionStore } from "../simulation/selectionStore";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import {
  createCloudTexture,
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

const ringIds = new Set(["saturn", "uranus"]);

export const BodyMesh = memo(({ body, dateMs, mode, position, selected, showLabel, emphasis }: BodyMeshProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const focusBody = useSelectionStore((state) => state.focusBody);
  const radius = getBodySceneRadius(body, mode);
  const tiltRad = ((body.physical.axialTiltDeg ?? 0) * Math.PI) / 180;
  const visual = useMemo(() => getVisualProfile(body), [body]);
  const surfaceTexture = useMemo(() => createSurfaceTexture(body), [body]);
  const cloudTexture = useMemo(() => createCloudTexture(body), [body]);
  const emphasisOpacity = getEmphasisOpacity(emphasis);
  const isTransparent = emphasisOpacity < 1;
  const labelClassName = [
    "body-label",
    selected ? "selected" : "",
    emphasis === "muted" ? "quiet-label" : "",
    emphasis === "related" ? "related-label" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useFrame(() => {
    if (!meshRef.current || !body.physical.rotationPeriodHours) {
      return;
    }

    const rotationMs = Math.abs(body.physical.rotationPeriodHours) * 3_600_000;
    const direction = body.physical.rotationPeriodHours < 0 ? -1 : 1;
    meshRef.current.rotation.y = direction * ((dateMs % rotationMs) / rotationMs) * Math.PI * 2;

    if (cloudRef.current) {
      cloudRef.current.rotation.y = meshRef.current.rotation.y * 1.08 + 0.22;
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
            <sphereGeometry args={[radius * 2.6, 48, 48]} />
            <meshBasicMaterial
              color="#f7b260"
              transparent
              opacity={0.08 * emphasisOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[radius * 1.55, 48, 48]} />
            <meshBasicMaterial
              color="#ffd08a"
              transparent
              opacity={0.14 * emphasisOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <group rotation={[0, 0, tiltRad]}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[Math.max(radius, 0.002), body.type === "moon" ? 24 : 48, 32]} />
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
              emissive={visual.emissive ?? (body.type === "dwarfPlanet" ? "#080806" : "#000000")}
              transparent={isTransparent}
              opacity={emphasisOpacity}
              depthWrite={!isTransparent}
            />
          )}
        </mesh>
        {cloudTexture && (
          <mesh ref={cloudRef}>
            <sphereGeometry args={[Math.max(radius * 1.018, 0.002), 48, 32]} />
            <meshStandardMaterial
              map={cloudTexture}
              color="#ffffff"
              roughness={0.92}
              transparent
              opacity={(visual.cloudOpacity ?? 0.16) * emphasisOpacity}
              depthWrite={false}
            />
          </mesh>
        )}
        {visual.atmosphereColor && (
          <mesh>
            <sphereGeometry args={[Math.max(radius * 1.08, 0.002), 48, 32]} />
            <meshBasicMaterial
              color={visual.atmosphereColor}
              transparent
              opacity={(visual.atmosphereOpacity ?? 0.12) * emphasisOpacity}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}
        {ringIds.has(body.id) && (
          <mesh rotation={[Math.PI / 2, 0, body.id === "uranus" ? Math.PI / 2.8 : 0]}>
            <ringGeometry args={[radius * 1.35, radius * (body.id === "saturn" ? 1.82 : 2.05), 128]} />
            <meshStandardMaterial
              color={body.id === "saturn" ? "#d8c493" : "#b7d4d3"}
              side={THREE.DoubleSide}
              transparent
              opacity={(body.id === "saturn" ? 0.42 : 0.25) * emphasisOpacity}
              roughness={0.9}
              depthWrite={false}
            />
          </mesh>
        )}
        {body.id === "saturn" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 1.98, radius * 2.68, 128]} />
            <meshStandardMaterial
              color="#cbb37e"
              side={THREE.DoubleSide}
              transparent
              opacity={0.34 * emphasisOpacity}
              roughness={0.92}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {selected && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[Math.max(radius * 1.85, 0.18), Math.max(radius * 0.025, 0.008), 12, 96]} />
            <meshBasicMaterial color="#f1dfb8" transparent opacity={0.72} />
          </mesh>
          <mesh>
            <sphereGeometry args={[Math.max(radius * 2.15, 0.24), 32, 20]} />
            <meshBasicMaterial
              color="#f1dfb8"
              transparent
              opacity={0.035}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      {showLabel && (
        <Html position={[0, radius * 1.85 + 0.16, 0]} center distanceFactor={10} className={labelClassName}>
          {body.name}
        </Html>
      )}
    </group>
  );
});

BodyMesh.displayName = "BodyMesh";
