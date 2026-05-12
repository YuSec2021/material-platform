import { create } from "zustand";

type AppState = {
  healthProbeCount: number;
  lastHealthProbeAt: string | null;
  markHealthProbe: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  healthProbeCount: 0,
  lastHealthProbeAt: null,
  markHealthProbe: () =>
    set((state) => ({
      healthProbeCount: state.healthProbeCount + 1,
      lastHealthProbeAt: new Date().toISOString(),
    })),
}));
