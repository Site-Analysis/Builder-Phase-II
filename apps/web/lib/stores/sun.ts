"use client";

import { create } from "zustand";

export type SunDay = "summer" | "equinox" | "winter";

interface SunState {
  hour: number;          // 0–24, fractional (slider)
  day: SunDay;
  buildingH: number;     // metres — drives shadow length
  shadowOpacity: number; // 0–1 — controls cast-shadow fill opacity
  setHour: (h: number) => void;
  setDay: (d: SunDay) => void;
  setBuildingH: (h: number) => void;
  setShadowOpacity: (v: number) => void;
}

// Shared between the map sun-path overlay and the panel diagram so the
// time scroller drives both the on-map sun marker/shadow and the chart dot.
export const useSunStore = create<SunState>((set) => ({
  hour: 9,
  day: "equinox",
  buildingH: 12,
  shadowOpacity: 0.65,
  setHour: (hour) => set({ hour }),
  setDay: (day) => set({ day }),
  setBuildingH: (buildingH) => set({ buildingH: Math.max(1, Math.min(100, buildingH)) }),
  setShadowOpacity: (shadowOpacity) => set({ shadowOpacity: Math.max(0, Math.min(1, shadowOpacity)) }),
}));
