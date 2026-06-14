import { create } from "zustand";

// Which bottom sheet is currently expanded on phones. Only one full sheet is ever
// open at a time, so this is a single value rather than a set of booleans — opening
// one implicitly closes the others. Desktop ignores this entirely (it renders the
// always-on panels instead), so the store is a no-op there.
export type SheetId = "none" | "view" | "rocket" | "speed" | "inspector";

type UiState = {
  activeSheet: SheetId;
  // The inspector has a third "peek" state: presented as a slim bar but not expanded.
  // `inspectorPresented` tracks whether the inspector should appear at all (peek or
  // full); `activeSheet === "inspector"` means it is expanded.
  inspectorPresented: boolean;
  openSheet: (sheet: SheetId) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: SheetId) => void;
  presentInspector: () => void;
  dismissInspector: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeSheet: "none",
  inspectorPresented: false,
  openSheet: (activeSheet) => set({ activeSheet }),
  closeSheet: () => set({ activeSheet: "none" }),
  toggleSheet: (sheet) => set((state) => ({ activeSheet: state.activeSheet === sheet ? "none" : sheet })),
  presentInspector: () => set({ inspectorPresented: true }),
  dismissInspector: () =>
    set((state) => ({
      inspectorPresented: false,
      activeSheet: state.activeSheet === "inspector" ? "none" : state.activeSheet,
    })),
}));
