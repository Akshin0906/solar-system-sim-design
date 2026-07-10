import { create } from "zustand";
import { useRocketStore } from "../rockets/rocketStore";
import { useScaleStore } from "../../simulation/scaleStore";
import { useSelectionStore } from "../../simulation/selectionStore";
import { useTimeStore } from "../../simulation/timeStore";
import type { LabelDensity, ScaleMode } from "../../simulation/units";
import {
  findNextModeledSolarEclipse,
  type ModeledSolarEclipse,
} from "./eclipseChase";
import {
  authoredTourById,
  type AuthoredTourId,
  type DirectorStop,
  type ExperienceFidelity,
} from "./tours";

export type ActiveExperienceId = "eclipse-chase" | AuthoredTourId;

type TimeSnapshot = Pick<
  ReturnType<typeof useTimeStore.getState>,
  "direction" | "isPaused" | "preset" | "simulationDateMs" | "timeScale"
>;

type ScaleSnapshot = {
  mode: ScaleMode;
  labelDensity: LabelDensity;
  showGrid: boolean;
  showOrbits: boolean;
  showTrails: boolean;
};

type ExperienceSnapshot = {
  time: TimeSnapshot;
  scale: ScaleSnapshot;
};

type ExperienceState = {
  activeExperienceId: ActiveExperienceId | null;
  activeTourId: AuthoredTourId | null;
  activeStopIndex: number;
  activeStop: DirectorStop | null;
  eclipse: ModeledSolarEclipse | null;
  notice: string | null;
  startTour: (tourId: AuthoredTourId) => void;
  startEclipseChase: () => void;
  nextStop: () => void;
  previousStop: () => void;
  goToStop: (index: number) => void;
  replayEclipse: () => void;
  jumpToEclipseMaximum: () => void;
  stop: () => void;
  clearNotice: () => void;
};

const ECLIPSE_WATCH_LEAD_MS = 6 * 60 * 60 * 1_000;
let sessionSnapshot: ExperienceSnapshot | null = null;

const captureSnapshot = (): ExperienceSnapshot => {
  const time = useTimeStore.getState();
  const scale = useScaleStore.getState();
  return {
    time: {
      direction: time.direction,
      isPaused: time.isPaused,
      preset: time.preset,
      simulationDateMs: time.simulationDateMs,
      timeScale: time.timeScale,
    },
    scale: {
      mode: scale.mode,
      labelDensity: scale.labelDensity,
      showGrid: scale.showGrid,
      showOrbits: scale.showOrbits,
      showTrails: scale.showTrails,
    },
  };
};

const restoreSnapshot = () => {
  const snapshot = sessionSnapshot;
  sessionSnapshot = null;
  if (!snapshot || useTimeStore.getState().transportLocked) {
    return;
  }

  useTimeStore.setState(snapshot.time);
  useScaleStore.setState(snapshot.scale);
  useSelectionStore.getState().restoreViewSession("experience");
};

const sessionConflict = () => {
  if (useTimeStore.getState().transportLocked) {
    return "Exit the active scenario before starting a guided experience.";
  }
  if (useRocketStore.getState().activeRocketId) {
    return "End the active rocket watch before starting a guided experience.";
  }
  return null;
};

const configureExperiencePresentation = () => {
  const scale = useScaleStore.getState();
  scale.setLabelDensity("minimal");
  scale.setShowGrid(false);
  scale.setShowOrbits(true);
  scale.setShowTrails(false);
};

const applyDirectorStop = (stop: DirectorStop) => {
  useTimeStore.getState().setPaused(true);
  useScaleStore.getState().setMode(stop.scaleMode);
  const selection = useSelectionStore.getState();
  selection.selectBody(stop.selectedBodyId);
  selection.setCameraMode(stop.cameraMode);
};

const eclipseFidelity = (event: ModeledSolarEclipse): readonly ExperienceFidelity[] => [
  {
    tier: "physical",
    label: "Shadow-cone geometry",
    detail: "A finite-size Sun and Moon must cast a penumbra or core that intersects the physical Earth sphere.",
  },
  {
    tier: "modeled",
    label: event.isExtrapolated ? "Mean elements · extrapolated" : "Mean-element prediction",
    detail: event.isExtrapolated
      ? "The event is solved from the app's lunar mean-element model beyond its fitted interval; timing and eclipse class are educational."
      : "The event is solved from dated orbital elements, not a canned eclipse calendar; it is not navigation-grade.",
  },
  {
    tier: "distorted",
    label: "Readable view",
    detail: "The Earth–Moon camera enlarges bodies and spreads moon distance while preserving the modeled alignment date.",
  },
];

const eclipseStop = (event: ModeledSolarEclipse): DirectorStop => ({
  id: "eclipse-maximum",
  eyebrow: `Eclipse Chase · Modeled ${event.kind}`,
  title: "The shadow line finds Earth",
  narration: event.narration,
  watchFor:
    "Track the Moon between Sun and Earth. The date comes from a live syzygy search; the readable camera exaggerates size and separation so the alignment remains visible.",
  selectedBodyId: "earth",
  cameraMode: "earth-moon",
  scaleMode: "readable",
  fidelity: eclipseFidelity(event),
});

const configureEclipseClock = (event: ModeledSolarEclipse, atMaximum: boolean) => {
  const time = useTimeStore.getState();
  time.setDirection(1);
  time.setPreset("hour");
  time.setSimulationDateMs(atMaximum ? event.maximumDateMs : event.maximumDateMs - ECLIPSE_WATCH_LEAD_MS);
  time.setPaused(atMaximum);
};

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  activeExperienceId: null,
  activeTourId: null,
  activeStopIndex: 0,
  activeStop: null,
  eclipse: null,
  notice: null,

  startTour: (tourId) => {
    const conflict = sessionConflict();
    if (conflict) {
      set({ notice: conflict });
      return;
    }
    const tour = authoredTourById.get(tourId);
    if (!tour) {
      set({ notice: "That guided tour is not available." });
      return;
    }

    if (sessionSnapshot) {
      restoreSnapshot();
    }
    sessionSnapshot = captureSnapshot();
    useSelectionStore.getState().beginViewSession("experience");
    configureExperiencePresentation();
    const firstStop = tour.stops[0];
    applyDirectorStop(firstStop);
    set({
      activeExperienceId: tour.id,
      activeTourId: tour.id,
      activeStopIndex: 0,
      activeStop: firstStop,
      eclipse: null,
      notice: null,
    });
  },

  startEclipseChase: () => {
    const conflict = sessionConflict();
    if (conflict) {
      set({ notice: conflict });
      return;
    }
    const event = findNextModeledSolarEclipse(useTimeStore.getState().simulationDateMs);
    if (!event) {
      set({ notice: "No modeled solar eclipse was found in the next 550 simulation days." });
      return;
    }

    if (sessionSnapshot) {
      restoreSnapshot();
    }
    sessionSnapshot = captureSnapshot();
    useSelectionStore.getState().beginViewSession("experience");
    configureExperiencePresentation();
    const stop = eclipseStop(event);
    useScaleStore.getState().setMode(stop.scaleMode);
    const selection = useSelectionStore.getState();
    selection.selectBody(stop.selectedBodyId);
    selection.setCameraMode(stop.cameraMode);
    configureEclipseClock(event, false);
    set({
      activeExperienceId: "eclipse-chase",
      activeTourId: null,
      activeStopIndex: 0,
      activeStop: stop,
      eclipse: event,
      notice: null,
    });
  },

  nextStop: () => {
    const tourId = get().activeTourId;
    const tour = tourId ? authoredTourById.get(tourId) : undefined;
    if (!tour) {
      return;
    }
    get().goToStop(Math.min(get().activeStopIndex + 1, tour.stops.length - 1));
  },

  previousStop: () => {
    if (!get().activeTourId) {
      return;
    }
    get().goToStop(Math.max(get().activeStopIndex - 1, 0));
  },

  goToStop: (index) => {
    const tourId = get().activeTourId;
    const tour = tourId ? authoredTourById.get(tourId) : undefined;
    if (!tour) {
      return;
    }
    const boundedIndex = Math.min(Math.max(Math.trunc(index), 0), tour.stops.length - 1);
    const stop = tour.stops[boundedIndex];
    applyDirectorStop(stop);
    set({ activeStopIndex: boundedIndex, activeStop: stop, notice: null });
  },

  replayEclipse: () => {
    const event = get().eclipse;
    if (!event) {
      return;
    }
    configureEclipseClock(event, false);
  },

  jumpToEclipseMaximum: () => {
    const event = get().eclipse;
    if (!event) {
      return;
    }
    configureEclipseClock(event, true);
  },

  stop: () => {
    restoreSnapshot();
    set({
      activeExperienceId: null,
      activeTourId: null,
      activeStopIndex: 0,
      activeStop: null,
      eclipse: null,
      notice: null,
    });
  },

  clearNotice: () => set({ notice: null }),
}));
