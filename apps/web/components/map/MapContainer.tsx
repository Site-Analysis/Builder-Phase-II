// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer as LeafletMap, TileLayer, useMap } from "react-leaflet";
import type * as L from "leaflet";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// react-leaflet's center/zoom props apply only on mount. This child recenters
// the live map whenever the site coordinates resolve or change.
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    const key = `${center[0]},${center[1]},${zoom}`;
    if (key === last.current) return;
    last.current = key;
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [map, center, zoom]);
  return null;
}

// KGIS cadastral (survey-parcel) grid as an ArcGIS dynamic overlay. esri-leaflet is
// imported lazily because it touches `window` — keep it out of the SSR bundle. The
// KGIS service enforces minScale 40000, so the grid only draws once zoomed in.
const KGIS_CADASTRAL_URL =
  "https://kgis.ksrsac.in/kgismaps/rest/services/CadastralData_Admin/Dynamic_CadastralData_Admin/MapServer";

function CadastralLayer({ visible }: { visible: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const { dynamicMapLayer } = await import("esri-leaflet");
      if (cancelled) return;
      const layer = dynamicMapLayer({
        url: KGIS_CADASTRAL_URL,
        layers: [5],
        opacity: 0.85,
        attribution: "Cadastral: KGIS (KSRSAC) — indicative, not a legal survey",
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();
    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [visible, map]);
  return null;
}

export interface MapContainerProps {
  mode: "full-screen" | "split";
  center?: [number, number];
  zoom?: number;
  children?: React.ReactNode;
  className?: string;
}

export function MapContainer({
  mode,
  center = [12.9716, 77.5946], // Bangalore default
  zoom = 13,
  children,
  className,
}: MapContainerProps) {
  // Satellite basemap (MapTiler) helps locate rural parcels the street basemap can't.
  const mtKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");
  // KGIS cadastral overlay ships dark — enabled per-deployment via env flag (US-081).
  const cadastralEnabled = process.env.NEXT_PUBLIC_ENABLE_CADASTRAL === "1";
  const [cadastral, setCadastral] = useState(false);
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
        {basemap === "satellite" && mtKey ? (
          <TileLayer
            url={`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${mtKey}`}
            attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={20}
          />
        ) : (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={20}
          />
        )}
        <MapController center={center} zoom={zoom} />
        {cadastralEnabled && cadastral && <CadastralLayer visible />}
        {children}
      </LeafletMap>
      {mtKey && (
        <button
          type="button"
          onClick={() => setBasemap((b) => (b === "street" ? "satellite" : "street"))}
          aria-label="Toggle satellite basemap"
          style={{
            position: "absolute", bottom: 30, right: 12, zIndex: 500,
            padding: "5px 10px", fontSize: 11, fontWeight: 700,
            border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, cursor: "pointer",
            background: "#FDFCFB", color: "#3A3F3B", fontFamily: "inherit",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          {basemap === "street" ? "Satellite" : "Street"}
        </button>
      )}
      {cadastralEnabled && (
        <button
          type="button"
          onClick={() => setCadastral((c) => !c)}
          aria-label="Toggle cadastral parcel grid"
          aria-pressed={cadastral}
          style={{
            position: "absolute", bottom: 58, right: 12, zIndex: 500,
            padding: "5px 10px", fontSize: 11, fontWeight: 700,
            border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, cursor: "pointer",
            background: cadastral ? "#0F766E" : "#FDFCFB",
            color: cadastral ? "#FFFFFF" : "#3A3F3B", fontFamily: "inherit",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          Cadastral
        </button>
      )}
    </div>
  );
}
