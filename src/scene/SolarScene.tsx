import { Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { computeScenePositions, getBodySceneRadius } from "../simulation/units";
import { BeltCloud } from "./BeltCloud";
import { BodyMesh } from "./BodyMesh";
import { CameraRig } from "./CameraRig";
import { EclipticCues } from "./EclipticCues";
import { Lighting } from "./Lighting";
import { MotionTrail } from "./MotionTrail";
import { OrbitRing } from "./OrbitRing";
import { useSceneLabelLayout } from "./labelLayout";
import { useReducedMotion } from "../ui/useMediaQuery";
import type { BodyEmphasis } from "./planetVisuals";
import { RocketObject } from "../features/rockets/RocketObject";
import { ScenarioLayer } from "./ScenarioLayer";
import { PostFx } from "./effects/PostFx";
import { RedGiantStar } from "./effects/RedGiantStar";
import { Interloper } from "./effects/Interloper";
import { ImpactFx } from "./effects/ImpactFx";
import { CometTail } from "./effects/CometTail";
import { MoltenRemnant } from "./effects/MoltenRemnant";
import type { ScenePositions } from "./scenePositions";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { getSceneLabelledIds } from "./sceneLabels";
import { getAnalyticOccluders, getFocusedSystemParentId } from "./eclipseShadows";
import { AdaptiveExposure } from "./AdaptiveExposure";
import { AdaptiveQuality } from "./AdaptiveQuality";
import {
  drainConsumed,
  getElapsedSimSeconds,
  getFragmentCapHit,
  getLatestEvent,
  getLiveFragmentCount,
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
  const reducedMotion = useReducedMotion();
  const positionsRef = useRef<ScenePositions>({});
  const positionsInitializedRef = useRef(false);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const consumedIds = useScenarioStore((state) => state.consumedIds);
  // Tracks which scenario instance the integrator was seeded for, so the frame loop
  // re-seeds on start and on every param edit (both bump the store's instanceId).
  const scenarioInstanceRef = useRef<number | null>(null);
  const elapsedReportRef = useRef(0);
  // Throttling can be a one-frame event (for example, a tab returning from the
  // background), so latch it until the next ~8 Hz store report instead of allowing a
  // normal frame to clear the signal before React sees it.
  const throttledReportRef = useRef(false);
  const reportedEventRef = useRef<ReturnType<typeof getLatestEvent>>(null);

  // When a live catastrophe consumes the body the camera is on, hand the camera to a
  // surviving world instead of snapping abruptly back to the origin. Prefer a large, stable
  // outer planet, falling back inward and to the Sun. Also fires when the selected body is a
  // moon whose parent was consumed (moons aren't participants, so they never appear in
  // consumedIds, but a consumed parent takes its moons' meshes + positions with it).
  useEffect(() => {
    if (!activeScenarioId) {
      return;
    }
    const selected = bodiesById.get(selectedId);
    const selectedGone =
      consumedIds.includes(selectedId) ||
      (selected?.type === "moon" && selected.parentId !== null && consumedIds.includes(selected.parentId));
    if (!selectedGone) {
      return;
    }
    const consumed = new Set(consumedIds);
    const survivor = ["jupiter", "saturn", "neptune", "uranus", "sun", "earth", "venus", "mars", "mercury"].find(
      (id) => bodiesById.has(id) && !consumed.has(id),
    );
    if (survivor && survivor !== selectedId) {
      useSelectionStore.getState().setSelectedId(survivor);
    }
  }, [activeScenarioId, consumedIds, selectedId]);

  const selectedBody = bodiesById.get(selectedId);
  const presetMoonParentId =
    cameraMode === "earth-moon"
      ? "earth"
      : cameraMode === "jupiter-system"
        ? "jupiter"
        : cameraMode === "saturn-system"
          ? "saturn"
          : undefined;
  const moonFocusParentId =
    presetMoonParentId ??
    (selectedBody?.type === "moon"
      ? selectedBody.parentId
      : childBodiesByParentId[selectedId]?.some((body) => body.type === "moon")
        ? selectedId
        : undefined);
  const isMoonContext = Boolean(
    moonFocusParentId && (presetMoonParentId || cameraMode === "moons" || selectedBody?.type === "moon"),
  );
  const focusedSystemParentId = presetMoonParentId ?? getFocusedSystemParentId(selectedBody, childBodiesByParentId);
  const eclipseOccludersById = useMemo(() => {
    const occluders = new Map<string, ReturnType<typeof getAnalyticOccluders>>();
    bodies.forEach((body) => {
      const bodyOccluders = getAnalyticOccluders(
        body,
        focusedSystemParentId,
        bodiesById,
        childBodiesByParentId,
      );
      if (bodyOccluders.length > 0) {
        occluders.set(body.id, bodyOccluders);
      }
    });
    return occluders;
  }, [focusedSystemParentId]);

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
    return getSceneLabelledIds({
      bodies,
      childBodiesByParentId,
      isMoonContext,
      labelDensity,
      mode,
      moonFocusParentId,
      selectedBody,
      selectedId,
    });
  }, [isMoonContext, labelDensity, mode, moonFocusParentId, selectedBody, selectedId]);
  const suppressedLabelIds = useSceneLabelLayout({ bodies, labelledIds, selectedId });

  const trailBodies = useMemo(() => {
    // Motion trails are sampled from the Kepler orbit, which no longer describes the
    // path once a scenario hands bodies to the live integrator — so suppress them.
    if (!showTrails || activeScenarioId || cameraMode === "observer") {
      return [];
    }

    return bodies.filter((body) => body.orbit);
  }, [showTrails, activeScenarioId, cameraMode]);

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
        throttledReportRef.current = false;
        reportedEventRef.current = null;
      }

      if (scenario.status === "running") {
        // The runtime preserves ordinary low-FPS deltas through a bounded accumulator,
        // while safely capping background gaps and surfacing any debt/drop as throttling.
        const step = stepRuntime(delta, scenario.timeScaleDaysPerSec);
        throttledReportRef.current ||= step.throttled;
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
        useScenarioStore.getState().reportRuntime({
          elapsedSimSeconds: getElapsedSimSeconds(),
          fragmentCapHit: getFragmentCapHit(),
          liveFragmentCount: getLiveFragmentCount(),
          throttled: throttledReportRef.current,
        });
        const latestEvent = getLatestEvent();
        if (latestEvent !== reportedEventRef.current) {
          reportedEventRef.current = latestEvent;
          useScenarioStore.getState().reportEvent(latestEvent);
        }
        throttledReportRef.current = false;
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
      <Stars radius={500} depth={90} count={2_300} factor={2.35} saturation={0.28} fade speed={reducedMotion ? 0 : 0.16} />
      <AdaptiveQuality />
      <AdaptiveExposure positionsRef={positionsRef} solarRadius={getBodySceneRadius(bodiesById.get("sun")!, mode)} />
      <Lighting positionsRef={positionsRef} />
      {showGrid && cameraMode !== "observer" && <EclipticCues mode={mode} opacityMultiplier={isMoonContext ? 0.22 : 1} />}
      {cameraMode !== "observer" && <BeltCloud mode={mode} opacityMultiplier={isMoonContext ? 0.28 : 1} />}
      {showOrbits && cameraMode !== "observer" &&
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
          eclipseOccluders={eclipseOccludersById.get(body.id)}
          selected={body.id === selectedId}
          showLabel={labelledIds.has(body.id)}
          labelSuppressed={suppressedLabelIds.has(body.id)}
          emphasis={emphasisById.get(body.id) ?? "normal"}
        />
      ))}
      <ScenarioLayer mode={mode} />
      {isRedGiant && <RedGiantStar mode={mode} />}
      {activeScenarioId === "rogue-blackhole" && <Interloper mode={mode} />}
      {activeScenarioId === "impact" && <CometTail mode={mode} />}
      {activeScenarioId && <MoltenRemnant mode={mode} />}
      {activeScenarioId && <ImpactFx mode={mode} />}
      {/* The rocket view is derived from the J2000 clock, which a scenario freezes — so a
          rocket would hang mid-flight against the frozen base layer (and is nonsensical if
          its origin world was just destroyed). Hide it while a scenario owns the scene; it
          resumes from the same mission time when the scenario exits and the clock unfreezes. */}
      {!activeScenarioId && <RocketObject />}
      <CameraRig positionsRef={positionsRef} mode={mode} />
      <PostFx />
    </>
  );
};
