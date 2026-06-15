import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { AdditiveBlending, type Group } from "three";
import { getExtraSimBodies, getRuntimeRevision, sceneRadiusForSimBody } from "../scenarios/scenarioRuntime";
import { useScenarioStore } from "../scenarios/scenarioStore";
import type { SimBody } from "../scenarios/types";
import { scaleVectorFromSun, type ScaleMode } from "../simulation/units";
import { SCENE_HTML_Z_INDEX_RANGE } from "../ui/htmlLayering";

const noopRaycast = () => null;

const labelForKind = (kind: string) => (kind === "fragment" ? "Fragment" : "Rogue mass");

// How a given injected body should be drawn by the generic layer. A scenario can
// override per-body via SimBody.renderHint (e.g. a black hole sets "custom" so its
// bespoke overlay owns the visual and we skip it here).
const renderHintFor = (sb: SimBody): "marker" | "fragment" | "custom" =>
  sb.renderHint ?? (sb.kind === "fragment" ? "fragment" : "marker");

type Descriptor = {
  id: string;
  color: string;
  label: string;
  radius: number;
  hint: "marker" | "fragment";
};

// Renders bodies the integrator owns that aren't in the data model — a rogue
// interloper, debris fragments. Mirrors RocketObject: declarative meshes that R3F
// disposes automatically, positioned imperatively each frame from the live sim so
// the heavy numbers never flow through React state.
//
// The descriptor list is re-derived whenever the integrator's body set changes (a
// fragment spawns, a body dies) — tracked via the runtime revision token that the
// per-frame loop watches. That is what lets debris created mid-step get a mesh without
// waiting for a re-seed. The hot per-frame work stays imperative (group.position).
export const ScenarioLayer = ({ mode }: { mode: ScaleMode }) => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const instanceId = useScenarioStore((state) => state.instanceId);
  const groupRefs = useRef<Map<string, Group>>(new Map());
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(-1);

  // Static per-body descriptors (id, colour, size, label). Re-snapshotted when a
  // scenario (re)seeds (instanceId) or the live body set changes (revision).
  const descriptors = useMemo<Descriptor[]>(() => {
    if (!activeScenarioId) {
      return [];
    }
    const out: Descriptor[] = [];
    for (const sb of getExtraSimBodies()) {
      const hint = renderHintFor(sb);
      if (hint === "custom") {
        continue; // a bespoke overlay (e.g. the black hole) draws this one
      }
      out.push({
        id: sb.id,
        color: sb.color,
        label: sb.label ?? labelForKind(sb.kind),
        radius: sceneRadiusForSimBody(sb, mode),
        hint,
      });
    }
    return out;
    // instanceId drives re-snapshot on (re)seed; revision on spawn/death; mode rescales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenarioId, instanceId, mode, revision]);

  useFrame(() => {
    if (!activeScenarioId) {
      return;
    }
    // Re-derive the descriptor list when the live body set changed (a fragment spawned
    // or a body died). Cheap: only fires on actual change, not every frame.
    const rev = getRuntimeRevision();
    if (rev !== revisionRef.current) {
      revisionRef.current = rev;
      setRevision(rev);
    }

    // getExtraSimBodies() only returns live bodies, so a rogue/fragment that gets
    // absorbed (e.g. a sub-solar-mass rogue swallowed by the Sun) drops out here.
    // Position the living ones and hide any group whose body is no longer alive.
    const liveIds = new Set<string>();
    for (const sb of getExtraSimBodies()) {
      if (renderHintFor(sb) === "custom") {
        continue;
      }
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
          {descriptor.hint === "fragment" ? (
            // Debris speck: a single low-poly glowing core. No label (a 40-strong swarm
            // of labels would be unreadable) and a lighter mesh budget than a marker.
            <mesh raycast={noopRaycast}>
              <sphereGeometry args={[descriptor.radius, 12, 8]} />
              <meshBasicMaterial color={descriptor.color} toneMapped={false} />
            </mesh>
          ) : (
            <>
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
            </>
          )}
        </group>
      ))}
    </group>
  );
};
