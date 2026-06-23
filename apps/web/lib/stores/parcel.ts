// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { create } from "zustand";
import type { ParcelGeometry } from "@/lib/api/analysis";

// Decouples the survey-number search (LandRecordsPanel) from the map renderer
// (project workspace) — the panel sets the located parcel, the map draws it.
interface ParcelState {
  parcel: ParcelGeometry | null;
  setParcel: (p: ParcelGeometry | null) => void;
  clearParcel: () => void;
}

export const useParcelStore = create<ParcelState>((set) => ({
  parcel: null,
  setParcel: (p) => set({ parcel: p }),
  clearParcel: () => set({ parcel: null }),
}));
