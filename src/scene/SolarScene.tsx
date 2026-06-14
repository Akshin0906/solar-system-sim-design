import { Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { computeScenePositions } from "../simulation/units";
import { BeltCloud } from "./BeltCloud";
import { BodyMesh } from "./BodyMesh";
import { CameraRig } from "./CameraRig";
import { EclipticCues } from "./EclipticCues";
import { Lighting } from "./Lighting";
import { MotionTrail } from "./MotionTrail";
import { OrbitRing } from "./OrbitRing";
import type { BodyEmphasis } from "./planetVisuals";
import { RocketObject } from "../future/rockets/RocketObject";
import type { ScenePositions } from "./scenePositions";

export const SolarScene = () => {
  const mode = useScaleStore((state) => state.mode);
  const showGrid = useScaleStore((state) => state.showGrid);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const labelDensity = useScaleStore((state) => state.labelDensity);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const positionsRef = useRef<ScenePositions>({});
  const positionsInitializedRef = useRef(false);
  const selectedBody = bodiesById.get(selectedId);
  const moonFocusParentId =
    selectedBody?.type === "moon"
      ? selectedBody.parentId
      : childBodiesByParentId[selectedId]?.some((body) => body.type === "moon")
        ? selectedId
        : undefined;
  const isMoonContext = Boolean(moonFocusParentId && (cameraMode === "moons" || selectedBody?.type === "moon"));

  const emphasisById = useMemo(() => {
    const emphasis = new Map<string, BodyEmphasis>();
    bodies.forEach((body) => emphasis.set(body.id, "normal"));

    if (isMoonContext && moonFocusParentId) {
      bodies.forEach((body) => emphasis.set(body.id, "muted"));
      emphasis.set(moonFocusParentId, moonFocusParentId === selectedId ? "primary" : "related");
      const parentBody = bodiesById.get(moonFocusParentId);

      if (parentBody?.parentId) {
        emphasis.set(parentBody.parentId, "related");
      }

      childBodiesByParentId[moonFocusParentId]
        ?.filter((body) => body.type === "moon")
        .forEach((body) => emphasis.set(body.id, body.id === selectedId ? "primary" : "related"));
    }

    emphasis.set(selectedId, "primary");
    return emphasis;
  }, [isMoonContext, moonFocusParentId, selectedId]);

  const labelledIds = useMemo(() => {
    const ids = new Set<string>();

    bodies.forEach((body) => {
      const isDefaultLabel =
        body.render.showLabelDefault && (body.type !== "dwarfPlanet" || body.id === "pluto" || labelDensity === "full");

      if (body.id === selectedId || isDefaultLabel) {
        ids.add(body.id);
      }

      if (labelDensity === "standard" && selectedBody) {
        if (body.parentId === selectedBody.id || (selectedBody.type === "moon" && body.parentId === selectedBody.parentId)) {
          ids.add(body.id);
        }
      }

      if (labelDensity === "full") {
        ids.add(body.id);
      }
    });

    if (isMoonContext && moonFocusParentId) {
      ids.clear();
      ids.add(moonFocusParentId);
      childBodiesByParentId[moonFocusParentId]
        ?.filter((body) => body.type === "moon")
        .forEach((body) => ids.add(body.id));
      ids.add(selectedId);
    }

    if (labelDensity === "minimal") {
      bodies.forEach((body) => {
        if (body.type === "moon" || body.type === "dwarfPlanet" || body.id === "sun") {
          ids.delete(body.id);
        }
      });
      ids.add(selectedId);
    }

    return ids;
  }, [isMoonContext, labelDensity, moonFocusParentId, selectedBody, selectedId]);

  const trailBodies = useMemo(() => {
    if (!showTrails) {
      return [];
    }

    return bodies.filter((body) => body.orbit);
  }, [showTrails]);

  if (!positionsInitializedRef.current) {
    computeScenePositions(
      bodies,
      bodiesById,
      new Date(useTimeStore.getState().simulationDateMs),
      mode,
      positionsRef.current,
    );
    positionsInitializedRef.current = true;
  }

  useFrame(() => {
    computeScenePositions(
      bodies,
      bodiesById,
      new Date(useTimeStore.getState().simulationDateMs),
      mode,
      positionsRef.current,
    );
  });

  return (
    <>
      <color attach="background" args={["#050609"]} />
      <fog attach="fog" args={["#050609", 150, 590]} />
      <Stars radius={500} depth={90} count={2_300} factor={2.35} saturation={0.28} fade speed={0.16} />
      <Lighting />
      {showGrid && <EclipticCues mode={mode} opacityMultiplier={isMoonContext ? 0.22 : 1} />}
      <BeltCloud mode={mode} opacityMultiplier={isMoonContext ? 0.28 : 1} />
      {showOrbits &&
        bodies.map((body) => (
          <OrbitRing
            key={body.id}
            body={body}
            mode={mode}
            positionsRef={positionsRef}
            emphasis={emphasisById.get(body.id) ?? "normal"}
            highlight={body.id === selectedId && !(isMoonContext && body.id === moonFocusParentId)}
          />
        ))}
      {trailBodies.map((body) => (
        <MotionTrail key={body.id} body={body} mode={mode} selected={body.id === selectedId} />
      ))}
      {bodies.map((body) => (
        <BodyMesh
          key={body.id}
          body={body}
          mode={mode}
          positionsRef={positionsRef}
          selected={body.id === selectedId}
          showLabel={labelledIds.has(body.id)}
          emphasis={emphasisById.get(body.id) ?? "normal"}
        />
      ))}
      <RocketObject />
      <CameraRig positionsRef={positionsRef} mode={mode} />
    </>
  );
};
