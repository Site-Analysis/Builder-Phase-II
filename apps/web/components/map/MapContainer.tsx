"use client";

import { useEffect, useRef } from "react";
import { MapContainer as LeafletMap, TileLayer } from "react-leaflet";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

export interface MapContainerProps {
  mode: "full-screen" | "split";
  center?: [number, number];
  zoom?: number;
  children?: React.ReactNode;
  className?: string;
}

export function MapContainer({
  mode,
  center = [20.5937, 78.9629], // India centroid default
  zoom = 13,
  children,
  className,
}: MapContainerProps) {
  return (
    <div
      className={cn(
        "relative",
        mode === "full-screen" && "fixed inset-0 z-0",
        mode === "split" && "flex-1 h-full",
        className
      )}
      role="application"
      aria-label="Site map"
    >
      <LeafletMap
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {children}
      </LeafletMap>
    </div>
  );
}
