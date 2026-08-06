import { Canvas, invalidate } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import { CAMERA_FOV_DEG } from "../scene/cameraFraming";
import { SolarScene } from "../scene/SolarScene";
import { ObjectInspector } from "../ui/ObjectInspector";
import { ScaleControls } from "../ui/ScaleControls";
import { ScenarioPanel } from "../ui/ScenarioPanel";
import { TimeControls } from "../ui/TimeControls";
import { TopBar } from "../ui/TopBar";
import { BottomSheet } from "../ui/BottomSheet";
import { ExperiencePanel } from "../ui/ExperiencePanel";
import { RocketLauncherPanel, RocketWatchHud } from "../features/rockets/RocketLauncherPanel";
import { useRocketStore } from "../features/rockets/rocketStore";
import { useExperienceStore } from "../features/experiences/experienceStore";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { useTimeStore } from "../simulation/timeStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { useUiStore } from "../ui/uiStore";
import { useIsMobile, useReducedMotion } from "../ui/useMediaQuery";
import { PhotoModeExit } from "../features/share/ViewShareControls";
import { usePhotoModeStore } from "../features/share/photoModeStore";
import { applySharedViewFromLocation } from "../features/share/viewState";
import {
  copyClientDiagnostics,
  reportClientDiagnostic,
} from "../observability/clientDiagnostics";
import {
  DiscoverabilityCue,
  KeyboardShortcuts,
  LowInformationRecovery,
  SceneAccessibleDescription,
  SimulationLiveRegion,
  TimeDriver,
} from "./AppSupport";

const canCreateWebGlContext = () => {
  if (typeof document === "undefined") {
    return true;
  }

  const canvas = document.createElement("canvas");
  let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    return Boolean(context);
  } catch {
    return false;
  } finally {
    // Drop the backing store. Explicitly invoking WEBGL_lose_context here can stall the
    // shared GPU process just as the real renderer starts, so this probe is reserved for
    // an explicit Retry rather than ordinary startup.
    canvas.width = 0;
    canvas.height = 0;
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
      <div className="webgl-fallback-actions">
        <button className="reset-time webgl-retry" type="button" onClick={onRetry}>
          Retry
        </button>
        <button className="reset-time" type="button" onClick={() => void copyClientDiagnostics()}>
          Copy diagnostics
        </button>
      </div>
    )}
  </section>
);

type CanvasGlFactory = Extract<
  NonNullable<ComponentProps<typeof Canvas>["gl"]>,
  (...args: never[]) => unknown
>;
type CanvasRendererProps = Parameters<CanvasGlFactory>[0];

export const App = () => {
  // Start optimistically and let WebGLRenderer be the capability check. Creating and
  // tearing down a separate probe context immediately before it caused severe startup
  // stalls in software-rendered/mobile Chromium; Retry still uses the explicit probe.
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [webglRestoring, setWebglRestoring] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);
  const restoreTimerRef = useRef<number | null>(null);
  const sharedViewAppliedRef = useRef(false);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const openSheet = useUiStore((state) => state.openSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const guidedExperienceActive = useExperienceStore((state) => state.activeExperienceId !== null);
  const scenarioActive = useScenarioStore((state) => state.activeScenarioId !== null);
  const reducedMotion = useReducedMotion();
  const photoMode = usePhotoModeStore((state) => state.active);
  // Captured at first render (useMediaQuery reads matchMedia synchronously) so the
  // mount-only auto-pause below reflects the initial OS preference, not later toggles.
  const initialReducedMotionRef = useRef(reducedMotion);
  // A running scenario animates on its own T+ clock with the J2000 clock frozen, so the
  // demand-mode render pump (the clock subscription below) goes silent. Switch the canvas
  // to a continuous loop while a scenario runs so the integrator + VFX keep stepping.
  const scenarioAnimating = useScenarioStore(
    (state) => state.activeScenarioId !== null && state.status === "running",
  );

  useEffect(() => {
    document.getElementById("prehydrate-splash")?.remove();
    if (!sharedViewAppliedRef.current) {
      sharedViewAppliedRef.current = true;
      applySharedViewFromLocation();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
      }
    };
  }, []);

  // Respect prefers-reduced-motion: if it is set when the app first mounts, start paused
  // (no autoplaying orbital motion). Deliberately gated to mount only — a runtime OS toggle
  // must not re-pause and clobber a Play the user deliberately started. The starfield drift
  // is also gated to 0 in SolarScene, and the camera rig already snaps instead of damping.
  useEffect(() => {
    if (initialReducedMotionRef.current) {
      useTimeStore.getState().setPaused(true);
    }
  }, []);

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
    } catch (error) {
      reportClientDiagnostic("webgl-init-failure", error);
      setWebglUnavailable(true);
      return await new Promise<never>(() => undefined);
    }
  }, []);

  return (
    <ErrorBoundary
      fallback={(reset) => (
        <main className="app-shell">
          <section className="webgl-fallback" role="alert">
            <span className="webgl-fallback-kicker">Something went wrong</span>
            <h1>The simulator hit an error</h1>
            <p>An unexpected error interrupted the view. Try again, or reload the page if it persists.</p>
            <div className="webgl-fallback-actions">
              <button className="reset-time webgl-retry" type="button" onClick={reset}>
                Try again
              </button>
              <button className="reset-time" type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
              <button className="reset-time" type="button" onClick={() => void copyClientDiagnostics()}>
                Copy diagnostics
              </button>
            </div>
          </section>
        </main>
      )}
    >
    <main className={`app-shell${photoMode ? " photo-mode" : ""}`}>
      <a className="skip-link" href="#main-controls">
        Skip to controls
      </a>
      <TimeDriver />
      <KeyboardShortcuts />
      <SimulationLiveRegion />
      <SceneAccessibleDescription />
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
          camera={{ position: [24, 18, 36], fov: CAMERA_FOV_DEG, near: 0.00001, far: 2_000 }}
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
            gl.domElement.setAttribute("aria-describedby", "solar-scene-description");
            // Attach the context-loss listeners at most once per canvas element. onCreated
            // can run again for the same element (e.g. a Retry/remount cycle), and these
            // listeners are never removed, so an unguarded add would stack duplicates that
            // each fire and race the restore timer. The flag makes re-registration a no-op.
            if (!gl.domElement.dataset.contextListenersAttached) {
              gl.domElement.dataset.contextListenersAttached = "true";
              gl.domElement.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                reportClientDiagnostic("webgl-context-lost", new Error("WebGL context lost"));
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
                reportClientDiagnostic("webgl-context-restored", new Error("WebGL context restored"));
                if (restoreTimerRef.current !== null) {
                  window.clearTimeout(restoreTimerRef.current);
                  restoreTimerRef.current = null;
                }
                setWebglRestoring(false);
                setWebglUnavailable(false);
              });
            }
          }}
        >
          {/* Keep the DOM controls alive if only the scene fails, while reporting the failure
              outside the canvas where a normal accessible recovery surface can render. */}
          <ErrorBoundary
            key={sceneRevision}
            fallback={() => null}
            onError={() => setSceneError(true)}
          >
            <Suspense fallback={null}>
              <SolarScene />
            </Suspense>
          </ErrorBoundary>
        </Canvas>
      )}
      {sceneError && !webglUnavailable && (
        <section className="scene-error" role="alert" aria-live="assertive">
          <span className="webgl-fallback-kicker">Scene interrupted</span>
          <strong>The solar system could not finish rendering.</strong>
          <p>Your controls and settings are still available. Retry the scene or reload the app.</p>
          <div className="webgl-fallback-actions">
            <button
              className="reset-time webgl-retry"
              type="button"
              onClick={() => {
                setSceneError(false);
                setSceneRevision((revision) => revision + 1);
                invalidate();
              }}
            >
              Retry scene
            </button>
            <button className="reset-time" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="reset-time" type="button" onClick={() => void copyClientDiagnostics()}>
              Copy diagnostics
            </button>
          </div>
        </section>
      )}
      {!webglUnavailable && (
        <div
          id="main-controls"
          className={`ui-layer${guidedExperienceActive ? " guided-experience-active" : ""}`}
          tabIndex={-1}
          data-mobile={isMobile ? "true" : undefined}
        >
          <TopBar />
          <DiscoverabilityCue isMobile={isMobile} />
          <LowInformationRecovery isMobile={isMobile} />
          <ExperiencePanel />
          {!guidedExperienceActive && (
            <>
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
              {isMobile && activeRocketId && activeSheet !== "rocket" && !scenarioActive && (
                <RocketWatchHud onOpenControls={() => openSheet("rocket")} />
              )}
              <ScenarioPanel />
            </>
          )}
          <TimeControls />
          <PhotoModeExit />
        </div>
      )}
      {webglRestoring && <WebGlFallback restoring onRetry={() => undefined} />}
    </main>
    </ErrorBoundary>
  );
};
