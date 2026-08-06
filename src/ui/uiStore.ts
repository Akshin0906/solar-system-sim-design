import { create } from "zustand";
import { useRocketStore } from "../features/rockets/rocketStore";
import { recommendRocketPlayback } from "../features/rockets/rocketPlayback";
import { useExperienceStore } from "../features/experiences/experienceStore";
import { useScenarioStore } from "../scenarios/scenarioStore";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";

// Which bottom sheet is currently expanded on phones. Only one full sheet is ever
// open at a time, so this is a single value rather than a set of booleans — opening
// one implicitly closes the others. Desktop ignores this entirely (it renders the
// always-on panels instead), so the store is a no-op there.
export type SheetId = "none" | "view" | "rocket" | "speed" | "inspector" | "scenario";

type UiState = {
  activeSheet: SheetId;
  searchOpen: boolean;
  helpOpen: boolean;
  // The inspector has a third "peek" state: presented as a slim bar but not expanded.
  // `inspectorPresented` tracks whether the inspector should appear at all (peek or
  // full); `activeSheet === "inspector"` means it is expanded.
  inspectorPresented: boolean;
  // Desktop-only open state for the Doomsday panel. Lifted out of the component so the
  // command palette can open it and so it can be made mutually exclusive with the rocket
  // panel. (On phones the Doomsday surface is a bottom sheet via activeSheet === "scenario".)
  doomsdayPanelOpen: boolean;
  // Session restoration state belongs to the store rather than module scope so
  // transitions are inspectable, resettable in tests, and safe across hot reloads.
  rocketClockSnapshot: RocketClockSnapshot | null;
  openSheet: (sheet: SheetId) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: SheetId) => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  presentInspector: () => void;
  dismissInspector: () => void;
  openDoomsdayPanel: () => void;
  closeDoomsdayPanel: () => void;
  toggleDoomsdayPanel: () => void;
  beginRocketWatch: (missionDurationSeconds?: number | null) => void;
  endRocketWatch: () => void;
  restoreRecommendedView: (isMobile?: boolean) => void;
};

type RocketClockSnapshot = Pick<
  ReturnType<typeof useTimeStore.getState>,
  "direction" | "isPaused" | "preset" | "simulationDateMs" | "timeScale"
>;

export const useUiStore = create<UiState>((set, get) => ({
  activeSheet: "none",
  searchOpen: false,
  helpOpen: false,
  inspectorPresented: false,
  doomsdayPanelOpen: false,
  rocketClockSnapshot: null,
  openSheet: (activeSheet) =>
    set({
      activeSheet,
      searchOpen: false,
      helpOpen: false,
    }),
  closeSheet: () => set({ activeSheet: "none" }),
  toggleSheet: (sheet) =>
    set((state) => ({
      activeSheet: state.activeSheet === sheet ? "none" : sheet,
      searchOpen: state.activeSheet === sheet ? state.searchOpen : false,
      helpOpen: state.activeSheet === sheet ? state.helpOpen : false,
    })),
  openSearch: () => set({ activeSheet: "none", searchOpen: true, helpOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
  toggleSearch: () =>
    set((state) =>
      state.searchOpen
        ? { searchOpen: false }
        : {
            activeSheet: "none",
            searchOpen: true,
            helpOpen: false,
          },
    ),
  openHelp: () => set({ activeSheet: "none", searchOpen: false, helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  toggleHelp: () =>
    set((state) =>
      state.helpOpen
        ? { helpOpen: false }
        : {
            activeSheet: "none",
            searchOpen: false,
            helpOpen: true,
          },
    ),
  presentInspector: () => set({ inspectorPresented: true }),
  dismissInspector: () =>
    set((state) => ({
      inspectorPresented: false,
      activeSheet: state.activeSheet === "inspector" ? "none" : state.activeSheet,
    })),
  openDoomsdayPanel: () => {
    useRocketStore.getState().setPanelOpen(false);
    set({ doomsdayPanelOpen: true });
  },
  closeDoomsdayPanel: () => set({ doomsdayPanelOpen: false }),
  toggleDoomsdayPanel: () => {
    const doomsdayPanelOpen = !get().doomsdayPanelOpen;
    if (doomsdayPanelOpen) {
      useRocketStore.getState().setPanelOpen(false);
    }
    set({ doomsdayPanelOpen });
  },
  beginRocketWatch: (missionDurationSeconds) => {
    // Rocket watch owns the camera and playback clock. End a guided tour first so
    // the rocket session snapshots the user's restored view, not a Director stop.
    useExperienceStore.getState().stop();
    const time = useTimeStore.getState();
    if (!get().rocketClockSnapshot) {
      set({
        rocketClockSnapshot: {
          direction: time.direction,
          isPaused: time.isPaused,
          preset: time.preset,
          simulationDateMs: time.simulationDateMs,
          timeScale: time.timeScale,
        },
      });
      useSelectionStore.getState().beginViewSession("rocket");
    }

    if (!time.transportLocked) {
      // A mission launched while the global clock is reversed otherwise remains
      // forever before T+0. Rocket watch temporarily owns the clock, including a
      // duration-aware playback rate; endRocketWatch restores the exact snapshot.
      time.setDirection(1);
      const playback = recommendRocketPlayback(missionDurationSeconds);
      if (playback?.preset) {
        time.setPreset(playback.preset);
      } else if (playback) {
        time.setTimeScale(playback.timeScale);
      }
      time.setPaused(false);
    }
  },
  endRocketWatch: () => {
    const time = useTimeStore.getState();
    const snapshot = get().rocketClockSnapshot;
    if (time.transportLocked) {
      const scenario = useScenarioStore.getState();
      if (snapshot && scenario.activeScenarioId) {
        // The scenario is the outer owner. Retiring the rocket now must not replace
        // the live scenario view or unlock its clock; instead, move the pre-rocket
        // baselines into the scenario's eventual restoration snapshots.
        useScenarioStore.setState({
          clockSnapshot: {
            direction: snapshot.direction,
            isPaused: snapshot.isPaused,
            preset: snapshot.preset,
            simulationDateMs: snapshot.simulationDateMs,
            timeScale: snapshot.timeScale,
          },
        });
        useSelectionStore.getState().foldViewSessionInto("rocket", "scenario");
        set({ rocketClockSnapshot: null });
      }
      return;
    }

    if (snapshot) {
      useTimeStore.setState({ ...snapshot });
    }
    // Restore the date before the view: body-relative presets and observer mode
    // derive their canonical framing from positions at the restored instant.
    useSelectionStore.getState().restoreViewSession("rocket");
    set({ rocketClockSnapshot: null });
  },
  restoreRecommendedView: (isMobile) => {
    useExperienceStore.getState().stop();
    if (useScenarioStore.getState().activeScenarioId) {
      useScenarioStore.getState().stop();
    }
    if (useRocketStore.getState().activeRocketId) {
      useRocketStore.getState().clear();
    }
    get().endRocketWatch();

    const mobile =
      isMobile ??
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 900px), (pointer: coarse)").matches);
    const scale = useScaleStore.getState();
    scale.setMode("compressed");
    scale.setLabelDensity(mobile ? "minimal" : "standard");
    scale.setShowGrid(false);
    scale.setShowOrbits(true);
    scale.setShowTrails(false);
    useSelectionStore.getState().resetRecommendedView();

    set({
      activeSheet: "none",
      searchOpen: false,
      helpOpen: false,
      inspectorPresented: false,
      doomsdayPanelOpen: false,
    });
  },
}));
