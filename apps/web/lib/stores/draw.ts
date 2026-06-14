"use client";

import { create } from "zustand";

// Stores the most recent committed rectangle drawn on the map.
// [lat, lng] corner pair — diagonal corners, order not guaranteed.
export type RectBounds = [[number, number], [number, number]];

interface DrawState {
  rectBounds: RectBounds | null;
  setRectBounds: (b: RectBounds | null) => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  rectBounds: null,
  setRectBounds: (b) => set({ rectBounds: b }),
}));
