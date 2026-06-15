import { Canvas, invalidate } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { X } from "lucide-react";
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import { bodiesById } from "../data";
import { SolarScene } from "../scene/SolarScene";
import { ObjectInspector } from "../ui/ObjectInspector";
import { ScaleControls } from "../ui/ScaleControls";
import { ScenarioPanel } from "../ui/ScenarioPanel";
import { TimeControls } from "../ui/TimeControls";
import { TopBar } from "../ui/TopBar";
import { BottomSheet } from "../ui/BottomSheet";
import { RocketLauncherPanel } from "../features/rockets/RocketLauncherPanel";
import { useRocketStore } from "../features/rockets/rocketStore";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { formatTimeScale } from "../simulation/units";
import { readBooleanPreference, writeBooleanPreference } from "../ui/safeStorage";
import { useUiStore } from "../ui/uiStore";
import { useIsMobile, useReducedMotion } from "../ui/useMediaQuery";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
};

// Any focusable control that should own its own keys (Space/arrows) rather than
// letting the global transport shortcuts steal them. Editable fields are a subset.
const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (isEditableTarget(target) || target.getAttribute("role") === "button") {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "a") {
    return target.hasAttribute("href");
  }

  return tagName === "button";
};

const isCanvasTarget = (target: EventTarget | null) =>
  target instanceof HTMLCanvasElement && target.classList.contains("solar-canvas");

const canCreateWebGlContext = () => {
  if (typeof document === "undefined") {
    return true;
  }

  const canvas = document.createElement("canvas");

  try {
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
};

const WebGlFallback = ({ onRetry, restoring = false }: { onRetry: () => void; restoring?: boolean }) => (
  <section className="webgl-fallback" role={restoring ? "status" : "alert"} aria-live="polite">
    <span className="webgl-fallback-kicker">Rendering paused</span>
    <h1>{restoring ? "Restoring WebGL" : "WebGL unavailable"}</h1>
    <p>
      {restoring
        ? "The graphics context was interrupted. The scene will resume automatically."
        : "This browser cannot create the graphics context needed for the simulator."}
    </p>
    {!restoring && (
      <button className="reset-time webgl-retry" type="button" onClick={onRetry}>
        Retry
      </button>
    )}
  </section>
);

const liveDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

type CanvasGlFactory = Extract<NonNullable<ComponentProps<typeof Canvas>["gl"]>, (defaultProps: any) => unknown>;
type CanvasRendererProps = Parameters<CanvasGlFactory>[0];

const TimeDriver = () => {
  const tick = useTimeStore((state) => state.tick);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(0);

  useEffect(() => {
    const targetTickSeconds = 1 / 30;

    const loop = (time: number) => {
      if (lastTimeRef.current !== null) {
        accumulatedTimeRef.current += Math.min((time - lastTimeRef.current) / 1_000, 0.12);

        if (accumulatedTimeRef.current >= targetTickSeconds) {
          tick(accumulatedTimeRef.current);
          accumulatedTimeRef.current = 0;
        }
      }

      lastTimeRef.current = time;
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      accumulatedTimeRef.current = 0;
    };
  }, [tick]);

  return null;
};

const KeyboardShortcuts = () => {
  const togglePaused = useTimeStore((state) => state.togglePaused);
  const stepDays = useTimeStore((state) => state.stepDays);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);

      if (event.key === "Escape") {
        const { closeSearch, closeSheet } = useUiStore.getState();
        closeSearch();
        closeSheet();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUiStore.getState().openSearch();
        return;
      }

      if (editable) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        useUiStore.getState().openSearch();
        return;
      }

      // Transport shortcuts belong to the scene; let a focused button/slider/link
      // handle Space and the arrow keys itself.
      if (isInteractiveTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePaused();
        return;
      }

      if (event.key === "ArrowLeft") {
        if (isCanvasTarget(event.target)) {
          return;
        }
        event.preventDefault();
        stepDays(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        if (isCanvasTarget(event.target)) {
          return;
        }
        event.preventDefault();
        stepDays(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepDays, togglePaused]);

  return null;
};

const SimulationLiveRegion = () => {
  const selectedId = useSelectionStore((state) => state.selectedId);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const isPaused = useTimeStore((state) => state.isPaused);
  const timeScale = useTimeStore((state) => state.timeScale);
  const selected = bodiesById.get(selectedId);
  // While playing, omit the continuously-changing date: a polite live region that
  // re-announced every simulated day (up to thousands/sec at high time scales) would
  // overwhelm a screen reader. The date is announced when paused or after a scrub.
  const dateSegment = isPaused ? ` · ${liveDateFormatter.format(new Date(simulationDateMs))}` : "";
  const message = `${selected?.name ?? "Object"} selected${dateSegment} · ${
    isPaused ? "paused" : "playing"
  } · ${formatTimeScale(timeScale)}`;

  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </span>
  );
};

const DISCOVERY_HINT_KEY = "solar-system-sim.discoveryHintDismissed";

const DiscoverabilityCue = () => {
  const [visible, setVisible] = useState(() => {
    return !readBooleanPreference(DISCOVERY_HINT_KEY);
  });

  const dismiss = useCallback(() => {
    setVisible(false);
    writeBooleanPreference(DISCOVERY_HINT_KEY, true);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = window.setTimeout(dismiss, 9_000);
    return () => window.clearTimeout(timer);
  }, [dismiss, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="discoverability-cue">
      <span>Click a planet · press / to search</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss hint">
        <X size={12} />
      </button>
    </div>
  );
};

export const App = () => {
  const [webglUnavailable, setWebglUnavailable] = useState(() => !canCreateWebGlContext());
  const [webglRestoring, setWebglRestoring] = useState(false);
  const restoreTimerRef = useRef<number | null>(null);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const reducedMotion = useReducedMotion();
  const didReducedMotionPauseRef = useRef(false);
  // A running scenario animates on its own T+ clock with the J2000 clock frozen, so the
  // demand-mode render pump (the clock subscription below) goes silent. Switch the canvas
  // to a continuous loop while a scenario runs so the integrator + VFX keep stepping.
  const scenarioAnimating = useScenarioStore(
    (state) => state.activeScenarioId !== null && state.status === "running",
  );

  // On phones the panels become dismissible bottom sheets that manage their own
  // exclusivity, so the desktop-only "hide the inspector while the rocket panel is
  // open" overlap hack must not apply.
  const layerClass = `ui-layer${rocketPanelOpen && !isMobile ? " rocket-open" : ""}`;

  useEffect(() => {
    document.getElementById("prehydrate-splash")?.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
      }
    };
  }, []);

  // Respect prefers-reduced-motion: start paused (no autoplaying orbital motion) the
  // first time the preference is detected. The starfield drift is also gated to 0 in
  // SolarScene, and the camera rig already snaps instead of damping.
  useEffect(() => {
    if (reducedMotion && !didReducedMotionPauseRef.current) {
      didReducedMotionPauseRef.current = true;
      useTimeStore.getState().setPaused(true);
    }
  }, [reducedMotion]);

  // The scene reads simulationDateMs non-reactively (via getState inside useFrame), so
  // with frameloop="demand" any clock change — playback tick, timeline scrub, step, or
  // jump-to-now — must explicitly request a render. Other scene inputs (scale mode,
  // overlay toggles, selection) are reactive props and already invalidate via R3F's
  // normal reconciliation.
  useEffect(
    () =>
      useTimeStore.subscribe((state, prev) => {
        if (state.simulationDateMs !== prev.simulationDateMs) {
          invalidate();
        }
      }),
    [],
  );

  // A scenario start/stop/pause/resume (or a param re-seed) must render at least one frame
  // even in demand mode — so the catastrophe seeds, the system snaps back on exit, and a
  // paused scenario repaints — since these don't advance the J2000 clock above.
  useEffect(
    () =>
      useScenarioStore.subscribe((state, prev) => {
        if (state.activeScenarioId !== prev.activeScenarioId || state.status !== prev.status || state.instanceId !== prev.instanceId) {
          invalidate();
        }
      }),
    [],
  );

  const createRenderer = useCallback(async (defaultProps: CanvasRendererProps) => {
    try {
      return new WebGLRenderer({
        ...defaultProps,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        logarithmicDepthBuffer: true,
      });
    } catch {
      setWebglUnavailable(true);
      return await new Promise<never>(() => undefined);
    }
  }, []);

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-controls">
        Skip to controls
      </a>
      <TimeDriver />
      <KeyboardShortcuts />
      <SimulationLiveRegion />
      {webglUnavailable ? (
        <WebGlFallback onRetry={() => setWebglUnavailable(!canCreateWebGlContext())} />
      ) : (
        <Canvas
          className="solar-canvas"
          // frameloop="demand" for normal browsing: with body motion driven imperatively
          // through refs, the renderer only draws when the clock advances (TimeDriver
          // invalidates) or the camera/scene changes. A live scenario animates on its own
          // frozen-clock T+ timeline, so it switches to "always" to pump frames continuously.
          // The a11y semantics (role/aria-label/tab focus) live on the inner <canvas> below —
          // the keyboard-interactive element — so the scene is announced and tab-stopped once.
          frameloop={scenarioAnimating ? "always" : "demand"}
          camera={{ position: [24, 18, 36], fov: 48, near: 0.00001, far: 2_000 }}
          dpr={[1, 1.65]}
          fallback={<p>WebGL unavailable</p>}
          gl={createRenderer}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.08;
            gl.outputColorSpace = SRGBColorSpace;
            gl.domElement.classList.add("solar-canvas");
            gl.domElement.setAttribute("role", "img");
            gl.domElement.setAttribute("aria-label", "Interactive 3D solar system simulation");
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              setWebglRestoring(true);
              if (restoreTimerRef.current !== null) {
                window.clearTimeout(restoreTimerRef.current);
              }
              restoreTimerRef.current = window.setTimeout(() => {
                setWebglRestoring(false);
                setWebglUnavailable(true);
              }, 6_000);
            });
            gl.domElement.addEventListener("webglcontextrestored", () => {
              if (restoreTimerRef.current !== null) {
                window.clearTimeout(restoreTimerRef.current);
                restoreTimerRef.current = null;
              }
              setWebglRestoring(false);
              setWebglUnavailable(false);
            });
          }}
        >
          <Suspense fallback={null}>
            <SolarScene />
          </Suspense>
        </Canvas>
      )}
      {!webglUnavailable && (
        <div id="main-controls" className={layerClass} tabIndex={-1} data-mobile={isMobile ? "true" : undefined}>
          <TopBar />
          <DiscoverabilityCue />
          <ScaleControls />
          <ObjectInspector />
          {isMobile ? (
            <BottomSheet
              open={activeSheet === "rocket"}
              onClose={closeSheet}
              id="rocket-preview-sheet"
              label="Rocket preview"
              title="Rocket preview"
            >
              <RocketLauncherPanel forceOpen embedded onClose={closeSheet} />
            </BottomSheet>
          ) : (
            <RocketLauncherPanel />
          )}
          <ScenarioPanel />
          <TimeControls />
        </div>
      )}
      {webglRestoring && <WebGlFallback restoring onRetry={() => undefined} />}
    </main>
  );
};
