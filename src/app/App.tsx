import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { SolarScene } from "../scene/SolarScene";
import { ObjectInspector } from "../ui/ObjectInspector";
import { ScaleControls } from "../ui/ScaleControls";
import { TimeControls } from "../ui/TimeControls";
import { TopBar } from "../ui/TopBar";
import { BottomSheet } from "../ui/BottomSheet";
import { RocketLauncherPanel } from "../future/rockets/RocketLauncherPanel";
import { useRocketStore } from "../future/rockets/rocketStore";
import { useTimeStore } from "../simulation/timeStore";
import { useUiStore } from "../ui/uiStore";
import { useIsMobile } from "../ui/useMediaQuery";

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
        window.dispatchEvent(new CustomEvent("solar:close-search"));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("solar:open-search"));
        return;
      }

      if (editable) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("solar:open-search"));
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
        event.preventDefault();
        stepDays(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepDays(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepDays, togglePaused]);

  return null;
};

export const App = () => {
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);

  // On phones the panels become dismissible bottom sheets that manage their own
  // exclusivity, so the desktop-only "hide the inspector while the rocket panel is
  // open" overlap hack must not apply.
  const layerClass = `ui-layer${rocketPanelOpen && !isMobile ? " rocket-open" : ""}`;

  return (
    <main className="app-shell">
      <TimeDriver />
      <KeyboardShortcuts />
      <Canvas
        className="solar-canvas"
        camera={{ position: [24, 18, 36], fov: 48, near: 0.00001, far: 2_000 }}
        dpr={[1, 1.65]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <SolarScene />
        </Suspense>
      </Canvas>
      <div className={layerClass} data-mobile={isMobile ? "true" : undefined}>
        <TopBar />
        <ScaleControls />
        <ObjectInspector />
        {isMobile ? (
          <BottomSheet open={activeSheet === "rocket"} onClose={closeSheet} label="Rocket launcher" title="Rocket launch">
            <RocketLauncherPanel forceOpen embedded onClose={closeSheet} />
          </BottomSheet>
        ) : (
          <RocketLauncherPanel />
        )}
        <TimeControls />
      </div>
    </main>
  );
};
