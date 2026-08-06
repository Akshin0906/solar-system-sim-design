import { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { bodiesById } from "../data";
import { useExperienceStore } from "../features/experiences/experienceStore";
import { useRocketStore } from "../features/rockets/rocketStore";
import { usePhotoModeStore } from "../features/share/photoModeStore";
import { scenarioById } from "../scenarios/registry";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { SCALE_MODES, formatBodyType, formatTimeScale } from "../simulation/units";
import { readBooleanPreference, writeBooleanPreference } from "../ui/safeStorage";
import { useUiStore } from "../ui/uiStore";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
};

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (isEditableTarget(target) || target.getAttribute("role") === "button") {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "button" || (tagName === "a" && target.hasAttribute("href"));
};

const isCanvasTarget = (target: EventTarget | null) =>
  target instanceof HTMLCanvasElement && target.classList.contains("solar-canvas");

const liveDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export const TimeDriver = () => {
  const tick = useTimeStore((state) => state.tick);
  const isPaused = useTimeStore((state) => state.isPaused);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(0);

  useEffect(() => {
    if (isPaused) {
      frameRef.current = null;
      lastTimeRef.current = null;
      accumulatedTimeRef.current = 0;
      return;
    }

    const targetTickSeconds = 1 / 30;

    const loop = (time: number) => {
      if (lastTimeRef.current !== null) {
        accumulatedTimeRef.current += Math.min((time - lastTimeRef.current) / 1_000, 0.12);

        // Drain the accumulator in fixed slices and carry the remainder. The
        // upstream clamp bounds background-tab catch-up so this cannot spiral.
        while (accumulatedTimeRef.current >= targetTickSeconds) {
          tick(targetTickSeconds);
          accumulatedTimeRef.current -= targetTickSeconds;
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
      frameRef.current = null;
      lastTimeRef.current = null;
      accumulatedTimeRef.current = 0;
    };
  }, [isPaused, tick]);

  return null;
};

export const KeyboardShortcuts = () => {
  const togglePaused = useTimeStore((state) => state.togglePaused);
  const stepDays = useTimeStore((state) => state.stepDays);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);

      if (event.key === "Escape") {
        if (usePhotoModeStore.getState().active) {
          usePhotoModeStore.getState().setActive(false);
          return;
        }
        const { closeSearch, closeSheet } = useUiStore.getState();
        useExperienceStore.getState().stop();
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

      if (isInteractiveTarget(event.target)) {
        return;
      }

      const scenarioActive = useScenarioStore.getState().activeScenarioId !== null;
      if (event.code === "Space") {
        event.preventDefault();
        if (scenarioActive) {
          useScenarioStore.getState().togglePause();
        } else {
          togglePaused();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        if (isCanvasTarget(event.target)) {
          return;
        }
        event.preventDefault();
        if (!scenarioActive) {
          stepDays(-1);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        if (isCanvasTarget(event.target)) {
          return;
        }
        event.preventDefault();
        if (!scenarioActive) {
          stepDays(1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepDays, togglePaused]);

  return null;
};

export const SimulationLiveRegion = () => {
  const selectedId = useSelectionStore((state) => state.selectedId);
  const isPaused = useTimeStore((state) => state.isPaused);
  const pausedSimulationDateMs = useTimeStore((state) => (state.isPaused ? state.simulationDateMs : null));
  const timeScale = useTimeStore((state) => state.timeScale);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const scenarioStatus = useScenarioStore((state) => state.status);
  const selected = bodiesById.get(selectedId);
  const activeScenario = activeScenarioId ? scenarioById.get(activeScenarioId) : undefined;
  const dateSegment =
    isPaused && pausedSimulationDateMs !== null
      ? ` · ${liveDateFormatter.format(new Date(pausedSimulationDateMs))}`
      : "";
  const message = activeScenario
    ? `${selected?.name ?? "Object"} selected · ${activeScenario.name} scenario ${scenarioStatus}`
    : `${selected?.name ?? "Object"} selected${dateSegment} · ${isPaused ? "paused" : "playing"} · ${formatTimeScale(timeScale)}`;

  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </span>
  );
};

const DISCOVERY_HINT_KEY = "solar-system-sim.discoveryHintDismissed";

export const DiscoverabilityCue = ({ isMobile }: { isMobile: boolean }) => {
  const [visible, setVisible] = useState(() => !readBooleanPreference(DISCOVERY_HINT_KEY));
  const openSearch = useUiStore((state) => state.openSearch);
  const openSheet = useUiStore((state) => state.openSheet);
  const setRocketPanelOpen = useRocketStore((state) => state.setPanelOpen);
  const startTour = useExperienceStore((state) => state.startTour);

  const dismiss = useCallback(() => {
    setVisible(false);
    writeBooleanPreference(DISCOVERY_HINT_KEY, true);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <aside className="discoverability-cue" aria-label="Start exploring">
      <span className="discovery-copy">
        <small>New here?</small>
        <strong>Choose a first move</strong>
      </span>
      <span className="discovery-actions">
        <button
          className="discovery-action"
          type="button"
          onClick={() => {
            dismiss();
            openSearch();
          }}
        >
          <Search size={14} aria-hidden /> Find a world
        </button>
        <button
          className="discovery-action"
          type="button"
          onClick={() => {
            dismiss();
            startTour("three-worlds");
          }}
        >
          <Sparkles size={14} aria-hidden /> Take a tour
        </button>
        <button
          className="discovery-action"
          type="button"
          onClick={() => {
            dismiss();
            if (isMobile) {
              openSheet("rocket");
            } else {
              setRocketPanelOpen(true);
            }
          }}
        >
          <Rocket size={14} aria-hidden /> Plan a mission
        </button>
      </span>
      <button className="discovery-close" type="button" onClick={dismiss} aria-label="Dismiss getting started">
        <X size={12} />
      </button>
    </aside>
  );
};

const cameraModeDescription: Record<ReturnType<typeof useSelectionStore.getState>["cameraMode"], string> = {
  free: "free-look camera",
  focus: "focused camera",
  follow: "body-follow camera",
  overview: "whole-system overview",
  inner: "inner-planets view",
  outer: "outer-planets view",
  "earth-moon": "Earth and Moon system view",
  "jupiter-system": "Jupiter system view",
  "saturn-system": "Saturn system view",
  "kuiper-belt": "Kuiper belt view",
  moons: "moon-system view",
  observer: "terminator observer view",
  "rocket-follow": "rocket-follow camera",
};

export const SceneAccessibleDescription = () => {
  const selectedId = useSelectionStore((state) => state.selectedId);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const mode = useScaleStore((state) => state.mode);
  const labelDensity = useScaleStore((state) => state.labelDensity);
  const showGrid = useScaleStore((state) => state.showGrid);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const selected = bodiesById.get(selectedId);
  const scale = SCALE_MODES.find((item) => item.id === mode);
  const guides = [
    labelDensity === "off" ? null : `${labelDensity} labels`,
    showGrid ? "ecliptic grid" : null,
    showOrbits ? "orbit paths" : null,
    showTrails ? "motion trails" : null,
  ].filter(Boolean);

  return (
    <p id="solar-scene-description" className="sr-only">
      Current scene: {cameraModeDescription[cameraMode]}, with {selected?.name ?? "the solar system"} selected
      {selected ? ` (${formatBodyType(selected.type)})` : ""}. {scale?.label ?? "Current"} scale lens: {scale?.note ?? "custom scale"}.
      {guides.length > 0 ? ` Visible guides: ${guides.join(", ")}.` : " All scene guides are hidden."} Use Search objects to
      browse the scene without relying on the canvas.
    </p>
  );
};

export const LowInformationRecovery = ({ isMobile }: { isMobile: boolean }) => {
  const labelDensity = useScaleStore((state) => state.labelDensity);
  const showGrid = useScaleStore((state) => state.showGrid);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const restoreRecommendedView = useUiStore((state) => state.restoreRecommendedView);
  const lowInformation = labelDensity === "off" && !showGrid && !showOrbits && !showTrails;

  if (!lowInformation) {
    return null;
  }

  return (
    <aside className="low-information-recovery" aria-label="View recovery">
      <span>
        <strong>Need your bearings?</strong>
        Labels and every guide are hidden.
      </span>
      <button type="button" onClick={() => restoreRecommendedView(isMobile)}>
        <RotateCcw size={14} aria-hidden /> Restore view
      </button>
    </aside>
  );
};
