"use client";

import { useMapEvents } from "react-leaflet";
import { useDrawStore } from "@/lib/stores/draw";

export interface MapClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}

export function MapClickHandler({ onMapClick }: MapClickHandlerProps) {
  const mode = useDrawStore((s) => s.mode);
  useMapEvents({
    click(e) {
      // A draw tool is active — those clicks build the shape; don't drop a marker.
      if (mode) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
