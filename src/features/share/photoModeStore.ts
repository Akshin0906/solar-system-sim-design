import { create } from "zustand";

type PhotoModeState = {
  active: boolean;
  setActive: (active: boolean) => void;
  toggle: () => void;
};

export const usePhotoModeStore = create<PhotoModeState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
  toggle: () => set((state) => ({ active: !state.active })),
}));
