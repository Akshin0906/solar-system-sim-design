import { Html, Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, DoubleSide, Quaternion, Shape, Vector3 } from "three";
import { useSelectionStore } from "../../simulation/selectionStore";
import { SCENE_HTML_Z_INDEX_RANGE } from "../../ui/htmlLayering";
import type { RocketProfile } from "./rocketCatalog";
import { getCachedRocketView, useActiveRocketView } from "./useRocketView";

// Renders the active rocket (and its destination cues) in the 3D scene.
//
// IMPORTANT: this deliberately does NOT follow the MotionTrail/OrbitRing pattern of
// imperatively constructing Three.js line objects inside a useMemo keyed on the
// frame date and disposing it by hand. The marker, the destination highlight, and
// the rings use declarative R3F geometry/materials (which React Three Fiber disposes
// automatically on unmount); the path and target lines use drei's <Line>, which
// manages its own geometry lifecycle.

const UP = new Vector3(0, 1, 0);
const noopRaycast = () => null;
const TARGET_COLOR = "#9fd2d9";
const BODY_COLOR = "#e9f0f2";
const BODY_SHADOW_COLOR = "#61717a";
const WINDOW_COLOR = "#86d7ff";
const ENGINE_CORE_COLOR = "#fff6cb";
const ENGINE_GLOW_COLOR = "#ff8a35";
const SAIL_COLOR = "#fff2bf";
const FIN_ROTATIONS = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
const SOLAR_SAIL_EDGE_POINTS: [number, number, number][] = [
  [0, 0, 0.24],
  [0.24, 0, 0],
  [0, 0, -0.24],
  [-0.24, 0, 0],
  [0, 0, 0.24],
];
const SOLAR_SAIL_CROSS_POINTS: [number, number, number][][] = [
  [
    [-0.24, 0, 0],
    [0.24, 0, 0],
  ],
  [
    [0, 0, -0.24],
    [0, 0, 0.24],
  ],
];
const EXHAUST_TRAILS: [number, number, number][][] = [
  [
    [0, -0.16, 0],
    [0, -0.43, 0],
  ],
  [
    [0.018, -0.15, 0],
    [0.045, -0.36, 0.012],
  ],
  [
    [-0.018, -0.15, 0],
    [-0.045, -0.36, -0.012],
  ],
];

const createFinShape = () => {
  const shape = new Shape();
  shape.moveTo(0.03, -0.085);
  shape.lineTo(0.092, -0.13);
  shape.lineTo(0.055, 0.035);
  shape.lineTo(0.03, 0.055);
  shape.lineTo(0.03, -0.085);
  return shape;
};

const createSolarSailShape = () => {
  const shape = new Shape();
  shape.moveTo(0, 0.24);
  shape.lineTo(0.24, 0);
  shape.lineTo(0, -0.24);
  shape.lineTo(-0.24, 0);
  shape.lineTo(0, 0.24);
  return shape;
};

const FIN_SHAPE = createFinShape();
const SOLAR_SAIL_SHAPE = createSolarSailShape();

const isSolarSailProfile = (profile: Pick<RocketProfile, "id" | "name">) => {
  const signature = `${profile.id} ${profile.name}`.toLowerCase();
  return signature.includes("solar") && signature.includes("sail");
};

export const RocketObject = () => {
  const { activeLaunchMode, activeMissionMode, destination, launchDateMs, mode, profile, view } = useActiveRocketView();
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const updateRocketTarget = useSelectionStore((state) => state.updateRocketTarget);
  const rocketScenePosition = view?.scenePosition ?? null;
  const transfer = view?.transfer ?? null;
  const transferArcScenePoints = transfer?.arcScenePoints ?? null;
  const progressIndex = transferArcScenePoints
    ? Math.max(
        1,
        Math.min(
          Math.floor((transfer?.progress ?? 0) * (transferArcScenePoints.length - 1)),
          transferArcScenePoints.length - 1,
        ),
      )
    : 0;

  // Orientation is frozen for the whole flight, so it only depends on the launch.
  const orientation = useMemo(() => {
    if (!profile || launchDateMs === null) {
      return [0, 0, 0, 1] as const;
    }
    const launchView = getCachedRocketView(
      profile,
      launchDateMs,
      launchDateMs,
      mode,
      destination,
      activeMissionMode,
      activeLaunchMode,
    );
    const dir = new Vector3(...launchView.sceneDirection);
    if (dir.lengthSq() === 0) {
      return [0, 0, 0, 1] as const;
    }
    return new Quaternion().setFromUnitVectors(UP, dir).toArray() as [number, number, number, number];
  }, [profile, launchDateMs, mode, destination, activeMissionMode, activeLaunchMode]);

  const completedTransferPoints = useMemo(() => {
    if (!transferArcScenePoints || !rocketScenePosition) {
      return [];
    }

    return [...transferArcScenePoints.slice(0, progressIndex + 1), rocketScenePosition];
  }, [progressIndex, rocketScenePosition, transferArcScenePoints]);

  useEffect(() => {
    if (cameraMode === "rocket-follow" && rocketScenePosition) {
      updateRocketTarget(rocketScenePosition);
    }
  }, [cameraMode, rocketScenePosition, updateRocketTarget]);

  if (!profile || launchDateMs === null || !view) {
    return null;
  }

  const markerScale = mode === "real" || mode === "readable" ? 2.4 : 1;
  const accent = profile.accentColor;
  const solarSail = isSolarSailProfile(profile);
  const target = view.destination;
  const highlightRadius = target ? Math.max(target.destSceneRadius * 2.4, 0.3) : 0;

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
            <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.68} side={DoubleSide} depthWrite={false} />
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
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        </>
      )}

      <group position={view.scenePosition}>
        {/* additive glow so the rocket is findable at any scale mode */}
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[0.2 * markerScale, 16, 16]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={solarSail ? 0.22 : 0.3}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        <group quaternion={orientation} scale={[markerScale, markerScale, markerScale]}>
          {solarSail && (
            <group position={[0, -0.01, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
                <shapeGeometry args={[SOLAR_SAIL_SHAPE]} />
                <meshStandardMaterial
                  color={SAIL_COLOR}
                  emissive={accent}
                  emissiveIntensity={0.18}
                  roughness={0.24}
                  metalness={0.05}
                  transparent
                  opacity={0.38}
                  side={DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <Line
                points={SOLAR_SAIL_EDGE_POINTS}
                color={SAIL_COLOR}
                lineWidth={1.1}
                transparent
                opacity={0.76}
                raycast={noopRaycast}
              />
              {SOLAR_SAIL_CROSS_POINTS.map((points, index) => (
                <Line
                  key={`solar-sail-spar-${index}`}
                  points={points}
                  color={accent}
                  lineWidth={0.85}
                  transparent
                  opacity={0.58}
                  raycast={noopRaycast}
                />
              ))}
            </group>
          )}

          <mesh position={[0, 0.015, 0]} raycast={noopRaycast}>
            <cylinderGeometry args={[0.034, 0.044, 0.21, 24]} />
            <meshStandardMaterial color={BODY_COLOR} roughness={0.34} metalness={0.38} />
          </mesh>
          <mesh position={[0, 0.165, 0]} raycast={noopRaycast}>
            <coneGeometry args={[0.034, 0.09, 24]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.38}
              roughness={0.36}
              metalness={0.16}
            />
          </mesh>
          <mesh position={[0, 0.092, 0.034]} raycast={noopRaycast}>
            <sphereGeometry args={[0.012, 12, 8]} />
            <meshStandardMaterial
              color={WINDOW_COLOR}
              emissive={WINDOW_COLOR}
              emissiveIntensity={0.42}
              roughness={0.12}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[0, 0.052, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
            <torusGeometry args={[0.039, 0.0032, 8, 32]} />
            <meshBasicMaterial color={accent} transparent opacity={0.75} />
          </mesh>
          <mesh position={[0, -0.046, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
            <torusGeometry args={[0.043, 0.003, 8, 32]} />
            <meshBasicMaterial color={BODY_SHADOW_COLOR} transparent opacity={0.72} />
          </mesh>
          {FIN_ROTATIONS.map((rotation) => (
            <group key={`rocket-fin-${rotation}`} rotation={[0, rotation, 0]}>
              <mesh raycast={noopRaycast}>
                <shapeGeometry args={[FIN_SHAPE]} />
                <meshStandardMaterial
                  color={accent}
                  emissive={accent}
                  emissiveIntensity={0.16}
                  roughness={0.42}
                  metalness={0.18}
                  side={DoubleSide}
                />
              </mesh>
            </group>
          ))}
          <mesh position={[0.048, -0.008, 0]} raycast={noopRaycast}>
            <cylinderGeometry args={[0.008, 0.01, 0.13, 12]} />
            <meshStandardMaterial color={BODY_SHADOW_COLOR} roughness={0.4} metalness={0.28} />
          </mesh>
          <mesh position={[-0.048, -0.008, 0]} raycast={noopRaycast}>
            <cylinderGeometry args={[0.008, 0.01, 0.13, 12]} />
            <meshStandardMaterial color={BODY_SHADOW_COLOR} roughness={0.4} metalness={0.28} />
          </mesh>
          <mesh position={[0, -0.125, 0]} raycast={noopRaycast}>
            <coneGeometry args={[0.034, 0.07, 20]} />
            <meshStandardMaterial color={BODY_SHADOW_COLOR} roughness={0.32} metalness={0.42} />
          </mesh>
          <mesh position={[0, -0.16, 0]} raycast={noopRaycast}>
            <sphereGeometry args={[0.025, 16, 8]} />
            <meshBasicMaterial
              color={ENGINE_CORE_COLOR}
              transparent
              opacity={0.82}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -0.25, 0]} raycast={noopRaycast}>
            <coneGeometry args={[0.055, 0.18, 24, 1, true]} />
            <meshBasicMaterial
              color={ENGINE_GLOW_COLOR}
              transparent
              opacity={0.28}
              blending={AdditiveBlending}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {EXHAUST_TRAILS.map((points, index) => (
            <Line
              key={`rocket-exhaust-trail-${index}`}
              points={points}
              color={index === 0 ? ENGINE_CORE_COLOR : accent}
              lineWidth={index === 0 ? 1.35 : 0.8}
              transparent
              opacity={index === 0 ? 0.56 : 0.32}
              raycast={noopRaycast}
            />
          ))}
          <mesh position={[0, -0.22, 0]} raycast={noopRaycast}>
            <sphereGeometry args={[0.062, 16, 12]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.72}
              roughness={0.8}
              metalness={0}
              transparent
              opacity={0.18}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
        <Html
          position={[0, 0.28 * markerScale, 0]}
          center
          distanceFactor={10}
          zIndexRange={SCENE_HTML_Z_INDEX_RANGE}
          className="rocket-scene-label"
        >
          {profile.name}
        </Html>
      </group>
    </group>
  );
};
