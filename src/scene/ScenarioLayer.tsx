import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Group } from "three";
import { getExtraSimBodies, sceneRadiusForSimBody } from "../scenarios/scenarioRuntime";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import { SCENE_HTML_Z_INDEX_RANGE } from "../ui/htmlLayering";

const noopRaycast = () => null;

const labelForKind = (kind: string) => (kind === "fragment" ? "Fragment" : "Rogue mass");

// Renders bodies the integrator owns that aren't in the data model — a rogue
// interloper, debris fragments. Mirrors RocketObject: declarative meshes that R3F
// disposes automatically, positioned imperatively each frame from the live sim so
// the heavy numbers never flow through React state.
export const ScenarioLayer = ({ mode }: { mode: ScaleMode }) => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const instanceId = useScenarioStore((state) => state.instanceId);
  const groupRefs = useRef<Map<string, Group>>(new Map());

  // Static per-instance descriptors (id, colour, size, label). Re-snapshotted when a
  // scenario starts or a slider re-seeds it.
  const descriptors = useMemo(() => {
    if (!activeScenarioId) {
      return [];
    }
    return getExtraSimBodies().map((sb) => ({
      id: sb.id,
      color: sb.color,
      label: labelForKind(sb.kind),
      radius: sceneRadiusForSimBody(sb, mode),
    }));
    // instanceId drives re-snapshot on (re)seed; mode rescales the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenarioId, instanceId, mode]);

  useFrame(() => {
    if (!activeScenarioId) {
      return;
    }
    // getExtraSimBodies() only returns live bodies, so a rogue/fragment that gets
    // absorbed (e.g. a sub-solar-mass rogue swallowed by the Sun) drops out here.
    // Position the living ones and hide any group whose body is no longer alive.
    const liveIds = new Set<string>();
    for (const sb of getExtraSimBodies()) {
      liveIds.add(sb.id);
      const group = groupRefs.current.get(sb.id);
      if (group) {
        const [x, y, z] = scaleVectorFromSun(sb.posKm, mode);
        group.position.set(x, y, z);
        group.visible = true;
      }
    }
    for (const [id, group] of groupRefs.current) {
      if (!liveIds.has(id)) {
        group.visible = false;
      }
    }
  });

  if (!activeScenarioId || descriptors.length === 0) {
    return null;
  }

  return (
    <group>
      {descriptors.map((descriptor) => (
        <group
          key={descriptor.id}
          ref={(node) => {
            if (node) {
              groupRefs.current.set(descriptor.id, node);
            } else {
              groupRefs.current.delete(descriptor.id);
            }
          }}
        >
          <mesh raycast={noopRaycast}>
            <sphereGeometry args={[descriptor.radius, 24, 18]} />
            <meshBasicMaterial color={descriptor.color} toneMapped={false} />
          </mesh>
          <mesh raycast={noopRaycast}>
            <sphereGeometry args={[descriptor.radius * 2.4, 24, 18]} />
            <meshBasicMaterial
              color={descriptor.color}
              transparent
              opacity={0.3}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <Html
            position={[0, descriptor.radius * 2.8, 0]}
            center
            distanceFactor={10}
            zIndexRange={SCENE_HTML_Z_INDEX_RANGE}
            className="rocket-scene-label"
          >
            {descriptor.label}
          </Html>
        </group>
      ))}
    </group>
  );
};
