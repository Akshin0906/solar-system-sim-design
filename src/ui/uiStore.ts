import { create } from "zustand";

// Which bottom sheet is currently expanded on phones. Only one full sheet is ever
// open at a time, so this is a single value rather than a set of booleans — opening
// one implicitly closes the others. Desktop ignores this entirely (it renders the
// always-on panels instead), so the store is a no-op there.
export type SheetId = "none" | "view" | "rocket" | "speed" | "inspector" | "scenario";

type UiState = {
  activeSheet: SheetId;
  searchOpen: boolean;
  // The inspector has a third "peek" state: presented as a slim bar but not expanded.
  // `inspectorPresented` tracks whether the inspector should appear at all (peek or
  // full); `activeSheet === "inspector"` means it is expanded.
  inspectorPresented: boolean;
  // Desktop-only open state for the Doomsday panel. Lifted out of the component so the
  // command palette can open it and so it can be made mutually exclusive with the rocket
  // panel. (On phones the Doomsday surface is a bottom sheet via activeSheet === "scenario".)
  doomsdayPanelOpen: boolean;
  openSheet: (sheet: SheetId) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: SheetId) => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  presentInspector: () => void;
  dismissInspector: () => void;
  openDoomsdayPanel: () => void;
  closeDoomsdayPanel: () => void;
  toggleDoomsdayPanel: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeSheet: "none",
  searchOpen: false,
  inspectorPresented: false,
  doomsdayPanelOpen: false,
  openSheet: (activeSheet) =>
    set({
      activeSheet,
      searchOpen: false,
    }),
  closeSheet: () => set({ activeSheet: "none" }),
  toggleSheet: (sheet) =>
    set((state) => ({
      activeSheet: state.activeSheet === sheet ? "none" : sheet,
      searchOpen: state.activeSheet === sheet ? state.searchOpen : false,
    })),
  openSearch: () => set({ activeSheet: "none", searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  toggleSearch: () =>
    set((state) =>
      state.searchOpen
        ? { searchOpen: false }
        : {
            activeSheet: "none",
            searchOpen: true,
          },
    ),
  presentInspector: () => set({ inspectorPresented: true }),
  dismissInspector: () =>
    set((state) => ({
      inspectorPresented: false,
      activeSheet: state.activeSheet === "inspector" ? "none" : state.activeSheet,
    })),
  openDoomsdayPanel: () => set({ doomsdayPanelOpen: true }),
  closeDoomsdayPanel: () => set({ doomsdayPanelOpen: false }),
  toggleDoomsdayPanel: () => set((state) => ({ doomsdayPanelOpen: !state.doomsdayPanelOpen })),
}));
