// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { create } from "zustand";
import type { ParcelGeometry } from "@/lib/api/analysis";
import type { RCCMSCase, MutationRecord, VillageInfo } from "@/lib/api/cadastral_records";

// A parcel the user CLICKED on the KGIS cadastral layer (SLICE 1 — the JOIN). Distinct from the
// land-records `parcel` (survey-number SEARCH). Carries KGIS's TRUE geometry (never the nudged
// screen position — Rule 5) so a human-eyeballed alignment offset can never drive a real analysis.
export interface SelectedParcel {
  surveyNumber: string;
  hasSurvey: boolean;
  category: string;                 // "Parcel" | "Road" | …
  ulpin: string;
  villageCode: string;
  lgdVillage: string;               // LGD_VillageCode from KGIS — used to resolve e-Chawadi hierarchy
  geometryTrue: GeoJSON.Polygon;    // UNSHIFTED KGIS geometry ([lon,lat] rings)
  centroid: [number, number];       // [lat, lon] of the true outer ring
  areaSqm: number;                  // shoelace area of the true ring (0 for degenerate/road)
}

// e-Chawadi (Bhoomi) land records fetched for the selected parcel via the cadastral service.
// Loaded asynchronously after parcel selection — null while loading or if service is down.
export interface EchawadiRecords {
  rccms:       RCCMSCase[];
  mutations:   MutationRecord[];
  villageInfo: VillageInfo | null;
  loading:     boolean;
  error:       string | null;
  // Encroachment — null means unchecked; false means checked + clear; true means flagged
  encroachmentFlagged: boolean | null;
  bbmpNotified:        boolean;
  revenueFlagged:      boolean;
}

// Decouples the survey-number search (LandRecordsPanel) from the map renderer
// (project workspace) — the panel sets the located parcel, the map draws it.
interface ParcelState {
  parcel: ParcelGeometry | null;
  setParcel: (p: ParcelGeometry | null) => void;
  clearParcel: () => void;
  // Clicked-parcel selection (map workspace). Kept separate so the two sources never conflate.
  selected: SelectedParcel | null;
  setSelected: (p: SelectedParcel | null) => void;
  clearSelected: () => void;
  // e-Chawadi land records for the selected parcel
  echawadiRecords: EchawadiRecords | null;
  setEchawadiRecords: (r: EchawadiRecords | null) => void;
}

const _emptyEchawadi = (): EchawadiRecords => ({
  rccms: [], mutations: [], villageInfo: null,
  loading: false, error: null,
  encroachmentFlagged: null, bbmpNotified: false, revenueFlagged: false,
});

export const useParcelStore = create<ParcelState>((set) => ({
  parcel: null,
  setParcel: (p) => set({ parcel: p }),
  clearParcel: () => set({ parcel: null }),
  selected: null,
  setSelected: (p) => set({ selected: p, echawadiRecords: null }),
  clearSelected: () => set({ selected: null, echawadiRecords: null }),
  echawadiRecords: null,
  setEchawadiRecords: (r) => set({ echawadiRecords: r }),
}));
