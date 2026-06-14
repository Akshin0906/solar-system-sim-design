import { create } from "zustand";
import { defaultRocketId } from "./rocketCatalog";
import { defaultDestinationId } from "./destinationCatalog";

// Rocket state is intentionally separate from celestial body state. It stores only
// the launch identity, the chosen destination, and the launch instant. The full
// flight state (speed, distance, position, mission status) is DERIVED from this plus
// the current simulation time in `rocketState.ts`, so it stays in sync with time
// scrubbing for free and never mutates any planet/moon data.

type RocketState = {
  selectedRocketId: string; // the profile chosen in the launcher (not yet launched)
  selectedDestinationId: string; // the destination chosen in the launcher
  activeRocketId: string | null; // the profile currently in flight, if any
  activeDestinationId: string | null; // the destination locked in at launch
  launchDateMs: number | null; // simulation time at launch
  panelOpen: boolean;
  selectRocket: (rocketId: string) => void;
  selectDestination: (destinationId: string) => void;
  launch: (rocketId: string, destinationId: string, launchDateMs: number) => void;
  clear: () => void;
  setPanelOpen: (panelOpen: boolean) => void;
  togglePanel: () => void;
};

export const useRocketStore = create<RocketState>((set) => ({
  selectedRocketId: defaultRocketId,
  selectedDestinationId: defaultDestinationId,
  activeRocketId: null,
  activeDestinationId: null,
  launchDateMs: null,
  panelOpen: false,
  selectRocket: (selectedRocketId) => set({ selectedRocketId }),
  selectDestination: (selectedDestinationId) => set({ selectedDestinationId }),
  launch: (rocketId, destinationId, launchDateMs) =>
    set({
      selectedRocketId: rocketId,
      selectedDestinationId: destinationId,
      activeRocketId: rocketId,
      activeDestinationId: destinationId,
      launchDateMs,
      panelOpen: true,
    }),
  clear: () => set({ activeRocketId: null, activeDestinationId: null, launchDateMs: null }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}));
