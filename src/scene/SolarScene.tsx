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
import { useSceneLabelLayout } from "./labelLayout";
import type { BodyEmphasis } from "./planetVisuals";
import { RocketObject } from "../future/rockets/RocketObject";
import { ScenarioLayer } from "./ScenarioLayer";
import { PostFx } from "./effects/PostFx";
import { RedGiantStar } from "./effects/RedGiantStar";
import type { ScenePositions } from "./scenePositions";
import { useScenarioStore } from "../scenarios/scenarioStore";
import {
  drainConsumed,
  getElapsedSimSeconds,
  startRuntime,
  stepRuntime,
  stopRuntime,
  writeScenePositions,
} from "../scenarios/scenarioRuntime";

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
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const consumedIds = useScenarioStore((state) => state.consumedIds);
  // Tracks which scenario instance the integrator was seeded for, so the frame loop
  // re-seeds on start and on every param edit (both bump the store's instanceId).
  const scenarioInstanceRef = useRef<number | null>(null);
  const elapsedReportRef = useRef(0);
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
  const suppressedLabelIds = useSceneLabelLayout({ bodies, labelledIds, selectedId });

  const trailBodies = useMemo(() => {
    // Motion trails are sampled from the Kepler orbit, which no longer describes the
    // path once a scenario hands bodies to the live integrator — so suppress them.
    if (!showTrails || activeScenarioId) {
      return [];
    }

    return bodies.filter((body) => body.orbit);
  }, [showTrails, activeScenarioId]);

  // While the red-giant scenario runs, its overlay (RedGiantStar) renders the swelling
  // Sun, so hide the normal Sun mesh to avoid a doubled, undersized disc inside it.
  const isRedGiant = activeScenarioId === "red-giant";

  // Bodies destroyed by an active catastrophe stop being drawn (mesh, orbit, trail).
  // A consumed planet also takes its moons with it — otherwise they linger as an
  // orphaned cluster pinned to where the planet was. (Only cascade to moons, so a
  // consumed Sun doesn't wrongly erase every planet.)
  const renderBodies = useMemo(() => {
    if (consumedIds.length === 0 && !isRedGiant) {
      return bodies;
    }
    const consumed = new Set(consumedIds);
    return bodies.filter(
      (body) =>
        !(isRedGiant && body.id === "sun") &&
        !consumed.has(body.id) &&
        !(body.type === "moon" && body.parentId !== null && consumed.has(body.parentId)),
    );
  }, [consumedIds, isRedGiant]);

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

  useFrame((_, delta) => {
    const scenario = useScenarioStore.getState();

    // --- Catastrophe path: the live N-body integrator owns positions ---
    if (scenario.activeScenarioId) {
      // (Re)seed when a scenario starts or a sandbox slider changes (instanceId bump).
      if (scenarioInstanceRef.current !== scenario.instanceId) {
        startRuntime(
          scenario.instanceId,
          scenario.activeScenarioId,
          scenario.params,
          bodies,
          bodiesById,
          useTimeStore.getState().simulationDateMs,
        );
        scenarioInstanceRef.current = scenario.instanceId;
        elapsedReportRef.current = 0;
      }

      if (scenario.status === "running") {
        // Clamp the real delta exactly like the Kepler clock (timeStore caps to 1/30s)
        // so a backgrounded-then-refocused tab can't dump a multi-second gap into the
        // integrator at once — that would spike to the substep cap, jank, and desync T+.
        stepRuntime(Math.min(delta, 1 / 30), scenario.timeScaleDaysPerSec);
      }

      writeScenePositions(positionsRef.current, mode);

      // Push the slow-changing facts back to React, throttled to ~8 Hz so the panel's
      // T+ clock and destroyed-planet list update without re-rendering every frame.
      const consumed = drainConsumed();
      if (consumed.length > 0) {
        useScenarioStore.getState().reportConsumed(consumed);
      }
      elapsedReportRef.current += delta;
      if (elapsedReportRef.current >= 0.12) {
        elapsedReportRef.current = 0;
        useScenarioStore.getState().reportElapsed(getElapsedSimSeconds());
      }
      return;
    }

    // --- Normal path: pristine Kepler positions from the J2000 clock ---
    if (scenarioInstanceRef.current !== null) {
      // A scenario just ended: discard the integrator so the system snaps back.
      stopRuntime();
      scenarioInstanceRef.current = null;
    }
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
      <fog attach="fog" args={["#050609", 240, 980]} />
      <Stars radius={500} depth={90} count={2_300} factor={2.35} saturation={0.28} fade speed={0.16} />
      <Lighting />
      {showGrid && <EclipticCues mode={mode} opacityMultiplier={isMoonContext ? 0.22 : 1} />}
      <BeltCloud mode={mode} opacityMultiplier={isMoonContext ? 0.28 : 1} />
      {showOrbits &&
        renderBodies.map((body) => (
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
      {renderBodies.map((body) => (
        <BodyMesh
          key={body.id}
          body={body}
          mode={mode}
          positionsRef={positionsRef}
          selected={body.id === selectedId}
          showLabel={labelledIds.has(body.id)}
          labelSuppressed={suppressedLabelIds.has(body.id)}
          emphasis={emphasisById.get(body.id) ?? "normal"}
        />
      ))}
      <ScenarioLayer mode={mode} />
      {isRedGiant && <RedGiantStar mode={mode} />}
      <RocketObject />
      <CameraRig positionsRef={positionsRef} mode={mode} />
      <PostFx />
    </>
  );
};
