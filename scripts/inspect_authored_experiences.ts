import { bodiesById } from "../src/data";
import { AU_KM, DAY_MS } from "../src/data/constants";
import {
  AUTHORED_TOURS,
  findNextModeledSolarEclipse,
  getSolarEclipseGeometry,
  useExperienceStore,
} from "../src/features/experiences";
import { useScaleStore } from "../src/simulation/scaleStore";
import { useSelectionStore } from "../src/simulation/selectionStore";
import { useTimeStore } from "../src/simulation/timeStore";
import { getBodySceneRadius, scaleDistanceFromSun } from "../src/simulation/units";
import { useScenarioStore } from "../src/scenarios/scenarioStore";
import { useUiStore } from "../src/ui/uiStore";

const starts = [
  Date.parse("2026-07-10T00:00:00.000Z"),
  Date.parse("2027-01-01T00:00:00.000Z"),
  Date.parse("2028-01-01T00:00:00.000Z"),
];

const eclipseCases = starts.map((startMs) => {
  const event = findNextModeledSolarEclipse(startMs);
  return {
    startMs,
    event,
    beforeOneHour: event ? getSolarEclipseGeometry(event.maximumDateMs - 60 * 60 * 1_000) : null,
    afterOneHour: event ? getSolarEclipseGeometry(event.maximumDateMs + 60 * 60 * 1_000) : null,
  };
});

const originalClock = {
  direction: -1 as const,
  isPaused: false,
  preset: "custom" as const,
  simulationDateMs: Date.parse("2026-08-03T04:00:00.000Z"),
  timeScale: 12_345,
};
const originalScale = {
  mode: "overview" as const,
  labelDensity: "full" as const,
  showGrid: true,
  showOrbits: false,
  showTrails: true,
};

useTimeStore.setState({ ...originalClock, transportLocked: false });
useScaleStore.setState(originalScale);
useSelectionStore.setState({
  selectedId: "mars",
  cameraMode: "focus",
  rocketTarget: null,
});

useExperienceStore.getState().startTour("scale-revelation");
const firstStopState = {
  experience: useExperienceStore.getState().activeExperienceId,
  stop: useExperienceStore.getState().activeStop?.id,
  mode: useScaleStore.getState().mode,
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
  paused: useTimeStore.getState().isPaused,
};

useExperienceStore.getState().nextStop();
const secondStopState = {
  stop: useExperienceStore.getState().activeStop?.id,
  mode: useScaleStore.getState().mode,
  cameraMode: useSelectionStore.getState().cameraMode,
};

useExperienceStore.getState().goToStop(99);
const boundedStopState = {
  index: useExperienceStore.getState().activeStopIndex,
  stop: useExperienceStore.getState().activeStop?.id,
};

useExperienceStore.getState().stop();
const restoredState = {
  clock: {
    direction: useTimeStore.getState().direction,
    isPaused: useTimeStore.getState().isPaused,
    preset: useTimeStore.getState().preset,
    simulationDateMs: useTimeStore.getState().simulationDateMs,
    timeScale: useTimeStore.getState().timeScale,
  },
  scale: {
    mode: useScaleStore.getState().mode,
    labelDensity: useScaleStore.getState().labelDensity,
    showGrid: useScaleStore.getState().showGrid,
    showOrbits: useScaleStore.getState().showOrbits,
    showTrails: useScaleStore.getState().showTrails,
  },
  selection: {
    selectedId: useSelectionStore.getState().selectedId,
    cameraMode: useSelectionStore.getState().cameraMode,
    rocketTarget: useSelectionStore.getState().rocketTarget,
  },
};

useTimeStore.setState({
  direction: -1,
  isPaused: true,
  preset: "custom",
  simulationDateMs: starts[0],
  timeScale: 54_321,
  transportLocked: false,
});
useExperienceStore.getState().startEclipseChase();
const eclipseSessionEvent = useExperienceStore.getState().eclipse;
const eclipseSessionState = {
  active: useExperienceStore.getState().activeExperienceId,
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
  scaleMode: useScaleStore.getState().mode,
  direction: useTimeStore.getState().direction,
  preset: useTimeStore.getState().preset,
  paused: useTimeStore.getState().isPaused,
  simulationDateMs: useTimeStore.getState().simulationDateMs,
  maximumDateMs: eclipseSessionEvent?.maximumDateMs ?? null,
};
useExperienceStore.getState().jumpToEclipseMaximum();
const maximumHoldState = {
  paused: useTimeStore.getState().isPaused,
  simulationDateMs: useTimeStore.getState().simulationDateMs,
};
useExperienceStore.getState().stop();
const eclipseRestoredClock = {
  direction: useTimeStore.getState().direction,
  isPaused: useTimeStore.getState().isPaused,
  preset: useTimeStore.getState().preset,
  simulationDateMs: useTimeStore.getState().simulationDateMs,
  timeScale: useTimeStore.getState().timeScale,
};

useTimeStore.setState({ ...originalClock, transportLocked: false });
useScaleStore.setState(originalScale);
useSelectionStore.setState({ selectedId: "mars", cameraMode: "focus", rocketTarget: null });
useExperienceStore.getState().startTour("three-worlds");
useScenarioStore.getState().start("red-giant");
const scenarioHandoffState = {
  experience: useExperienceStore.getState().activeExperienceId,
  scenario: useScenarioStore.getState().activeScenarioId,
  transportLocked: useTimeStore.getState().transportLocked,
};
useScenarioStore.getState().stop();
const scenarioExitState = {
  clock: {
    direction: useTimeStore.getState().direction,
    isPaused: useTimeStore.getState().isPaused,
    preset: useTimeStore.getState().preset,
    simulationDateMs: useTimeStore.getState().simulationDateMs,
    timeScale: useTimeStore.getState().timeScale,
  },
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
};

useExperienceStore.getState().startTour("three-worlds");
useUiStore.getState().beginRocketWatch();
const rocketHandoffState = {
  experience: useExperienceStore.getState().activeExperienceId,
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
};
useUiStore.getState().endRocketWatch();
const rocketExitState = {
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
};

useExperienceStore.getState().startTour("three-worlds");
useUiStore.getState().restoreRecommendedView(false);
const recommendedResetState = {
  experience: useExperienceStore.getState().activeExperienceId,
  selectedId: useSelectionStore.getState().selectedId,
  cameraMode: useSelectionStore.getState().cameraMode,
  scaleMode: useScaleStore.getState().mode,
  labelDensity: useScaleStore.getState().labelDensity,
};

const earth = bodiesById.get("earth");
const sun = bodiesById.get("sun");
if (!earth || !sun) {
  throw new Error("Missing Earth or Sun");
}

const scaleSamples = {
  oneAu: Object.fromEntries(
    (["real", "readable", "compressed", "overview"] as const).map((mode) => [
      mode,
      scaleDistanceFromSun(AU_KM, mode),
    ]),
  ),
  tenAu: Object.fromEntries(
    (["real", "readable", "compressed", "overview"] as const).map((mode) => [
      mode,
      scaleDistanceFromSun(AU_KM * 10, mode),
    ]),
  ),
  realRadiusRatio: getBodySceneRadius(sun, "real") / getBodySceneRadius(earth, "real"),
  physicalRadiusRatio: sun.physical.radiusKm / earth.physical.radiusKm,
};

console.log(JSON.stringify({
  constants: { AU_KM, DAY_MS },
  eclipseCases,
  tours: AUTHORED_TOURS.map((tour) => ({
    id: tour.id,
    stopIds: tour.stops.map((stop) => stop.id),
    scaleModes: tour.stops.map((stop) => stop.scaleMode),
    fidelityCounts: tour.stops.map((stop) => stop.fidelity.length),
  })),
  stateTransitions: {
    originalClock,
    originalScale,
    firstStopState,
    secondStopState,
    boundedStopState,
    restoredState,
    eclipseSessionState,
    maximumHoldState,
    eclipseRestoredClock,
    scenarioHandoffState,
    scenarioExitState,
    rocketHandoffState,
    rocketExitState,
    recommendedResetState,
  },
  scaleSamples,
}));
