// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { GeoJSON } from "react-leaflet";
import type { PathOptions } from "leaflet";

// KGIS cadastral parcel — distinct from the user-drawn site boundary (teal).
// Orange dashed outline reads as "official survey parcel, indicative".
const PARCEL_STYLE: PathOptions = {
  color: "#C2410C",
  weight: 2,
  fillColor: "#F97316",
  fillOpacity: 0.18,
  dashArray: "4 3",
};

export interface ParcelOverlayProps {
  // GeoJSON Polygon in WGS84 (lng, lat) straight from GET /geo/parcel.
  geometry: GeoJSON.Polygon | null | undefined;
  surveyNumber?: string | null;
}

export function ParcelOverlay({ geometry, surveyNumber }: ParcelOverlayProps) {
  if (!geometry) return null;
  const feature: GeoJSON.Feature = { type: "Feature", properties: {}, geometry };
  // react-leaflet <GeoJSON> only reads `data` on mount — key forces remount on change.
  const key = `${surveyNumber ?? ""}:${JSON.stringify(geometry.coordinates[0]?.[0] ?? [])}`;
  return <GeoJSON key={key} data={feature} style={PARCEL_STYLE} />;
}
