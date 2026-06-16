"use client";

import { create } from "zustand";

// Stores the most recent committed rectangle drawn on the map.
// [lat, lng] corner pair — diagonal corners, order not guaranteed.
export type RectBounds = [[number, number], [number, number]];

export type DrawMode = "rect" | "circle" | "poly" | null;

// A committed drawn site boundary (rectangle or polygon) as a [lat,lng] ring.
export interface DrawnBoundary {
  kind: "rect" | "poly";
  positions: [number, number][];
}

interface DrawState {
  rectBounds: RectBounds | null;
  setRectBounds: (b: RectBounds | null) => void;
  // Active draw tool — lets MapClickHandler suppress marker placement while drawing.
  mode: DrawMode;
  setMode: (m: DrawMode) => void;
  // Committed drawn boundary — used as the project site boundary (not a point).
  boundary: DrawnBoundary | null;
  setBoundary: (b: DrawnBoundary | null) => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  rectBounds: null,
  setRectBounds: (b) => set({ rectBounds: b }),
  mode: null,
  setMode: (m) => set({ mode: m }),
  boundary: null,
  setBoundary: (b) => set({ boundary: b }),
}));
