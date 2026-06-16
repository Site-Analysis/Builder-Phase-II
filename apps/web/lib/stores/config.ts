"use client";

import { create } from "zustand";

export interface AnalysisConfig {
  bufferM: number;
  startDate: string;
  endDate: string;
}

function defaultDates(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const DEFAULTS: AnalysisConfig = {
  bufferM: 100,   // slider minimum (0.1 km) — smallest analysis radius by default
  ...defaultDates(),
};

interface ConfigState extends AnalysisConfig {
  setConfig: (partial: Partial<AnalysisConfig>) => void;
  resetConfig: () => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  ...DEFAULTS,
  setConfig: (partial) => set((s) => ({ ...s, ...partial })),
  resetConfig: () => set({ ...DEFAULTS, ...defaultDates() }),
}));
