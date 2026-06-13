"use client";

import { GeoJSON, Circle } from "react-leaflet";
import type { PathOptions } from "leaflet";

const BOUNDARY_STYLE: PathOptions = {
  color: "var(--color-brand-secondary)",
  weight: 2,
  fillColor: "var(--color-brand-secondary-tint)",
  fillOpacity: 0.3,
};

export interface SiteBoundaryOverlayProps {
  shape: "circle" | "polygon";
  coordinates:
    | { center: [number, number]; radius: number }
    | [number, number][];
}

export function SiteBoundaryOverlay({
  shape,
  coordinates,
}: SiteBoundaryOverlayProps) {
  if (shape === "circle" && !Array.isArray(coordinates)) {
    return (
      <Circle
        center={coordinates.center}
        radius={coordinates.radius}
        pathOptions={BOUNDARY_STYLE}
      />
    );
  }

  if (shape === "polygon" && Array.isArray(coordinates)) {
    const geojson: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [coordinates.map(([lat, lng]) => [lng, lat])],
      },
    };
    return <GeoJSON data={geojson} style={BOUNDARY_STYLE} />;
  }

  return null;
}
