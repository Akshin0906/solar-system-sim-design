import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { useScaleStore } from "../../simulation/scaleStore";
import { useTimeStore } from "../../simulation/timeStore";
import { destinationsById } from "./destinationCatalog";
import { rocketsById } from "./rocketCatalog";
import { computeRocketView } from "./rocketState";
import { useRocketStore } from "./rocketStore";

// Renders the active rocket (and its destination cues) in the 3D scene.
//
// IMPORTANT: this deliberately does NOT follow the MotionTrail/OrbitRing pattern of
// imperatively constructing `new THREE.Line(...)` inside a useMemo keyed on the
// frame date and disposing it by hand. The marker, the destination highlight, and
// the rings use declarative R3F geometry/materials (which React Three Fiber disposes
// automatically on unmount); the path and target lines use drei's <Line>, which
// manages its own geometry lifecycle.

const UP = new THREE.Vector3(0, 1, 0);
const noopRaycast = () => null;
const TARGET_COLOR = "#9fd2d9";

export const RocketObject = () => {
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const activeDestinationId = useRocketStore((state) => state.activeDestinationId);
  const activeMissionMode = useRocketStore((state) => state.activeMissionMode);
  const activeLaunchMode = useRocketStore((state) => state.activeLaunchMode);
  const launchDateMs = useRocketStore((state) => state.launchDateMs);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const mode = useScaleStore((state) => state.mode);

  const profile = activeRocketId ? rocketsById.get(activeRocketId) : undefined;
  const destination = activeDestinationId ? destinationsById.get(activeDestinationId) ?? null : null;

  // Orientation is frozen for the whole flight, so it only depends on the launch.
  const orientation = useMemo(() => {
    if (!profile || launchDateMs === null) {
      return [0, 0, 0, 1] as const;
    }
    const view = computeRocketView(profile, launchDateMs, launchDateMs, mode, destination, activeMissionMode, activeLaunchMode);
    const dir = new THREE.Vector3(...view.sceneDirection);
    if (dir.lengthSq() === 0) {
      return [0, 0, 0, 1] as const;
    }
    return new THREE.Quaternion().setFromUnitVectors(UP, dir).toArray() as [number, number, number, number];
  }, [profile, launchDateMs, mode, destination, activeMissionMode, activeLaunchMode]);

  if (!profile || launchDateMs === null) {
    return null;
  }

  const view = computeRocketView(profile, launchDateMs, simulationDateMs, mode, destination, activeMissionMode, activeLaunchMode);
  const markerScale = mode === "real" || mode === "readable" ? 2.4 : 1;
  const accent = profile.accentColor;
  const target = view.destination;
  const highlightRadius = target ? Math.max(target.destSceneRadius * 2.4, 0.3) : 0;
  const transfer = view.transfer;
  const progressIndex = transfer
    ? Math.max(1, Math.min(Math.floor(transfer.progress * (transfer.arcScenePoints.length - 1)), transfer.arcScenePoints.length - 1))
    : 0;
  const completedTransferPoints = transfer
    ? [...transfer.arcScenePoints.slice(0, progressIndex + 1), view.scenePosition]
    : [];

  return (
    <group>
      {transfer ? (
        <>
          <Line
            points={transfer.arcScenePoints}
            color={accent}
            lineWidth={1.1}
            transparent
            opacity={0.34}
            raycast={noopRaycast}
          />
          <Line
            points={completedTransferPoints}
            color={accent}
            lineWidth={1.5}
            transparent
            opacity={0.78}
            raycast={noopRaycast}
          />
          <mesh position={view.launchScenePosition} raycast={noopRaycast}>
            <sphereGeometry args={[0.055 * markerScale, 12, 12]} />
            <meshBasicMaterial color={accent} transparent opacity={0.78} depthWrite={false} />
          </mesh>
          <mesh position={transfer.interceptScenePosition} raycast={noopRaycast}>
            <ringGeometry args={[0.11 * markerScale, 0.15 * markerScale, 28]} />
            <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.68} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={transfer.targetArrivalScenePosition} raycast={noopRaycast}>
            <sphereGeometry args={[0.045 * markerScale, 12, 12]} />
            <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.58} depthWrite={false} />
          </mesh>
        </>
      ) : (
        <Line
          points={view.directScenePoints ?? [view.launchScenePosition, view.scenePosition]}
          color={accent}
          lineWidth={1.4}
          transparent
          opacity={0.5}
          raycast={noopRaycast}
        />
      )}

      {target && (
        <>
          {/* minimal line from the rocket to the (current) destination */}
          <Line
            points={[view.scenePosition, target.destScenePosition]}
            color={TARGET_COLOR}
            lineWidth={1}
            transparent
            opacity={0.32}
            dashed
            dashSize={0.4}
            gapSize={0.28}
            raycast={noopRaycast}
          />
          {/* subtle highlight ring around the destination body */}
          <group position={target.destScenePosition}>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
              <torusGeometry args={[highlightRadius, Math.max(highlightRadius * 0.03, 0.012), 12, 64]} />
              <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.5} depthWrite={false} />
            </mesh>
            <mesh raycast={noopRaycast}>
              <sphereGeometry args={[highlightRadius * 0.92, 20, 16]} />
              <meshBasicMaterial
                color={TARGET_COLOR}
                transparent
                opacity={0.05}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        </>
      )}

      <group position={view.scenePosition}>
        {/* additive glow so the rocket is findable at any scale mode */}
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[0.18 * markerScale, 16, 16]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* nose cone pointing along the flight direction */}
        <group quaternion={orientation}>
          <mesh position={[0, 0.02 * markerScale, 0]} raycast={noopRaycast}>
            <coneGeometry args={[0.045 * markerScale, 0.15 * markerScale, 16]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.55}
              roughness={0.45}
              metalness={0.1}
            />
          </mesh>
        </group>
        <Html position={[0, 0.28 * markerScale, 0]} center distanceFactor={10} className="rocket-scene-label">
          {profile.name}
        </Html>
      </group>
    </group>
  );
};
