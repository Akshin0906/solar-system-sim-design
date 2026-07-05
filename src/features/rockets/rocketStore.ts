import { create } from "zustand";
import { useSelectionStore } from "../../simulation/selectionStore";
import { defaultRocketId } from "./rocketCatalog";
import { defaultDestinationId } from "./destinationCatalog";
import { defaultLaunchMode, defaultMissionMode, type RocketLaunchMode, type RocketMissionMode } from "./missionOptions";
import { clearRocketCaches } from "./rocketState";

// Rocket state is intentionally separate from celestial body state. It stores only
// the launch identity, the chosen destination, and the launch instant. The full
// flight state (speed, distance, position, mission status) is DERIVED from this plus
// the current simulation time in `rocketState.ts`, so it stays in sync with time
// scrubbing for free and never mutates any planet/moon data.

type RocketState = {
  selectedRocketId: string; // the profile chosen in the launcher (not yet launched)
  selectedDestinationId: string; // the destination chosen in the launcher
  selectedMissionMode: RocketMissionMode; // direct aim or transfer preview
  selectedLaunchMode: RocketLaunchMode; // Earth departure, LEO, or surface label
  activeRocketId: string | null; // the profile currently in flight, if any
  activeDestinationId: string | null; // the destination locked in at launch
  activeMissionMode: RocketMissionMode;
  activeLaunchMode: RocketLaunchMode;
  launchDateMs: number | null; // simulation time at launch
  panelOpen: boolean;
  selectRocket: (rocketId: string) => void;
  selectDestination: (destinationId: string) => void;
  selectMissionMode: (missionMode: RocketMissionMode) => void;
  selectLaunchMode: (launchMode: RocketLaunchMode) => void;
  launch: (
    rocketId: string,
    destinationId: string,
    missionMode: RocketMissionMode,
    launchMode: RocketLaunchMode,
    launchDateMs: number,
  ) => void;
  clear: () => void;
  setPanelOpen: (panelOpen: boolean) => void;
  togglePanel: () => void;
};

export const useRocketStore = create<RocketState>((set) => ({
  selectedRocketId: defaultRocketId,
  selectedDestinationId: defaultDestinationId,
  selectedMissionMode: defaultMissionMode,
  selectedLaunchMode: defaultLaunchMode,
  activeRocketId: null,
  activeDestinationId: null,
  activeMissionMode: defaultMissionMode,
  activeLaunchMode: defaultLaunchMode,
  launchDateMs: null,
  panelOpen: false,
  selectRocket: (selectedRocketId) => set({ selectedRocketId }),
  selectDestination: (selectedDestinationId) => set({ selectedDestinationId }),
  selectMissionMode: (selectedMissionMode) => set({ selectedMissionMode }),
  selectLaunchMode: (selectedLaunchMode) => set({ selectedLaunchMode }),
  launch: (rocketId, destinationId, missionMode, launchMode, launchDateMs) =>
    set({
      selectedRocketId: rocketId,
      selectedDestinationId: destinationId,
      selectedMissionMode: missionMode,
      selectedLaunchMode: launchMode,
      activeRocketId: rocketId,
      activeDestinationId: destinationId,
      activeMissionMode: missionMode,
      activeLaunchMode: launchMode,
      launchDateMs,
      panelOpen: true,
    }),
  clear: () => {
    // Full, predictable reset: also restore the mission mode and drop the derived-plan
    // caches so a retired mission leaves no stale state behind. Release the rocket-follow
    // camera here (not only in the panel's handler) so every reset path — including a
    // future scenario/global reset — exits follow instead of tracking a removed rocket.
    clearRocketCaches();
    useSelectionStore.getState().clearRocketTarget();
    set({
      activeRocketId: null,
      activeDestinationId: null,
      activeMissionMode: defaultMissionMode,
      activeLaunchMode: defaultLaunchMode,
      launchDateMs: null,
    });
  },
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}));
