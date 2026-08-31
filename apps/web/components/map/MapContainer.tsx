// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer as LeafletMap, TileLayer, useMap } from "react-leaflet";
import type * as L from "leaflet";
import { cn } from "@/lib/utils";
import { EchawadiParcels } from "./EchawadiParcels";
import { CadastralParcels } from "./CadastralParcels";
import { BuildingFootprints } from "./BuildingFootprints";
import { CadastralToolbar } from "./CadastralToolbar";
import { CadastralLayersPanel, DEFAULT_LAYER_STATE, type CadastralLayerState } from "./CadastralLayersPanel";
import { LgdVillagesOverlay } from "./LgdVillagesOverlay";
import { EncroachmentOverlay } from "./EncroachmentOverlay";
import { BbmpStormDrainOverlay } from "./BbmpStormDrainOverlay";
import { BwssbSewerageOverlay } from "./BwssbSewerageOverlay";
import { DrainageOverlay } from "./DrainageOverlay";
import { GasPipelineOverlay } from "./GasPipelineOverlay";
import { PowerLinesOverlay } from "./PowerLinesOverlay";
import { PowerGridOverlay } from "./PowerGridOverlay";
import { RoadWidthOverlay } from "./RoadWidthOverlay";
import { KGIS_ATTRIBUTION, KGIS_LICENSING, type CadastralResult, type CadastralParcel } from "@/lib/api/cadastral";
import { fetchParcelData, type SurveySearchResult } from "@/lib/api/cadastral_records";
import { OSM_ATTRIBUTION, type BuildingResult } from "@/lib/api/buildings";
import { useProfileStore } from "@/lib/stores/profile";
import { useConfigStore } from "@/lib/stores/config";
import { useUIStore } from "@/lib/stores/ui";
import { AmenitiesOverlay } from "./AmenitiesOverlay";
import { TransportAccessOverlay } from "./TransportAccessOverlay";
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

function MapFlyTo({ bounds }: { bounds: [[number, number], [number, number]] | null }) {
  const map = useMap();
  const prev = useRef<typeof bounds>(null);
  useEffect(() => {
    if (!bounds || bounds === prev.current) return;
    prev.current = bounds;
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
  }, [bounds, map]);
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
  // Project's stored site boundary ([lat,lng]) — parcels load for it when nothing is freshly drawn.
  siteBoundary?: [number, number][];
  // SLICE 1 — the JOIN. When set, clicking a KGIS parcel calls onParcelSelect with its TRUE geometry;
  // selectedParcelKey highlights the chosen parcel (see lib/api/cadastral.ts parcelKey).
  onParcelSelect?: (p: CadastralParcel) => void;
  selectedParcelKey?: string;
  /** Show Karnataka Cadastral toolbar (dropdown nav + layers panel). Gated by NEXT_PUBLIC_ENABLE_CADASTRAL_EXPLORER=1. */
  showCadastralUI?: boolean;
  /** Anchor the left map controls to bottom-left instead of mid-left (use when draggable cards occupy the left side). */
  controlsAtBottom?: boolean;
  /** Override center used by AmenitiesOverlay / TransportAccessOverlay without affecting the map's flyTo. */
  amenitiesCenter?: [number, number];
}

export function MapContainer({
  mode,
  center = [12.9716, 77.5946], // Bangalore default
  zoom = 13,
  children,
  className,
  siteBoundary,
  onParcelSelect,
  selectedParcelKey,
  showCadastralUI,
  controlsAtBottom,
  amenitiesCenter,
}: MapContainerProps) {
  // Satellite basemap (MapTiler) helps locate rural parcels the street basemap can't.
  const mtKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");
  // KGIS cadastral overlay ships dark — enabled per-deployment via env flag (US-081).
  const cadastralEnabled = process.env.NEXT_PUBLIC_ENABLE_CADASTRAL_EXPLORER === "1";
  const [cadastral, setCadastral] = useState(false);
  // KGIS L5 parcel FEATURES for the drawn area (survey no + attributes) — separate flag, default-off.
  const parcelsEnabled = process.env.NEXT_PUBLIC_ENABLE_PARCELS === "1";
  const [parcelsOn, setParcelsOn] = useState(false);
  // Cadastral explorer: toolbar-driven GeoJSON + layer panel toggles. Builder-only.
  const profile = useProfileStore((s) => s.profile);
  const { bufferM } = useConfigStore();
  const { nightMode } = useUIStore();
  const explorerEnabled = showCadastralUI === true && profile === "builder";
  const [toolbarGeoJSON, setToolbarGeoJSON] = useState<GeoJSON.FeatureCollection | null | undefined>(undefined);
  const [flyBounds, setFlyBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [selectedVillageName, setSelectedVillageName] = useState<string>("");
  const [selectedSurveyNo, setSelectedSurveyNo] = useState<string>("");
  const [layers, setLayers] = useState<CadastralLayerState>(DEFAULT_LAYER_STATE);
  function handleParcelSelectInternal(p: CadastralParcel) {
    setSelectedVillageName(p.villageName ?? "");
    setSelectedSurveyNo(p.surveyNumber ?? "");
    onParcelSelect?.(p);
  }

  async function handleSurveySelect(r: SurveySearchResult) {
    const fc = await fetchParcelData(r.dist, r.taluk, r.hobli, r.vlg);
    if (!fc?.features?.length) return;
    setToolbarGeoJSON(fc);
    const baseNo = r.survey_no.split("/")[0];
    const feature =
      fc.features.find((f) => String((f.properties as Record<string, string>)?.survey_no ?? "") === r.survey_no) ??
      fc.features.find((f) => String((f.properties as Record<string, string>)?.survey_no ?? "").split("/")[0] === baseNo);
    if (!feature) return;
    const g = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    let geom: GeoJSON.Polygon;
    let ring: number[][];
    if (g.type === "MultiPolygon") {
      const biggest = g.coordinates.reduce((a, b) => a[0].length >= b[0].length ? a : b);
      geom = { type: "Polygon", coordinates: biggest };
      ring = biggest[0];
    } else {
      geom = g;
      ring = g.coordinates[0];
    }
    if (!ring?.length) return;
    const lats = ring.map((c) => c[1]);
    const lons = ring.map((c) => c[0]);
    setFlyBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]]);
    const props = feature.properties as { survey_no: string; village_code?: string };
    const villageCode = props.village_code ?? r.vlg;
    setSelectedVillageName(r.village_name);
    setSelectedSurveyNo(r.survey_no);
    onParcelSelect?.({
      surveyNumber: r.survey_no, hasSurvey: true, category: "Parcel",
      kharab: "", label: baseNo, ulpin: "",
      villageCode: villageCode,
      lgdVillage: villageCode,
      geometry: geom,
    });
  }

  function toggleLayer(key: keyof CadastralLayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  const [parcelFilter, setParcelFilter] = useState("");
  const [parcelStatus, setParcelStatus] = useState<CadastralResult | "loading" | null>(null);
  const [buildingsOn, setBuildingsOn] = useState(false);
  const [buildingStatus, setBuildingStatus] = useState<BuildingResult | "loading" | null>(null);
  // Manual alignment nudge (metres) to rubber-sheet the indicative KGIS parcels onto the satellite.
  const [offsetE, setOffsetE] = useState(0);
  const [offsetN, setOffsetN] = useState(0);
  const cosLat = Math.cos((center[0] * Math.PI) / 180) || 1;
  const offLat = offsetN / 111320;
  const offLon = offsetE / (111320 * cosLat);
  const nb: React.CSSProperties = { width: 20, height: 20, fontSize: 10, border: "1px solid #CFD6C4", borderRadius: 4, background: "#FDFCFB", cursor: "pointer", padding: 0, lineHeight: "18px", textAlign: "center" };
  const filterMatch = typeof parcelStatus === "object" && parcelStatus?.status === "ok" && parcelFilter.trim()
    ? parcelStatus.parcels.some((p) => p.surveyNumber === parcelFilter.trim())
    : null;
  // FALLBACK: when KGIS has no parcels here (empty coverage gap) or is unreachable, auto-show OSM
  // building footprints so the drawn area isn't blank — labelled STRUCTURES, never re-branded parcels.
  const parcelEmpty = typeof parcelStatus === "object" && parcelStatus != null
    && (parcelStatus.status === "empty" || parcelStatus.status === "error");
  const buildingFallback = parcelsOn && parcelEmpty && !buildingsOn;
  const showBuildings = buildingsOn || buildingFallback;
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
      {explorerEnabled && (
        <div style={{ position: "fixed", top: 56, left: 0, right: 0, zIndex: 1200 }}>
          <CadastralToolbar onLoad={(fc) => setToolbarGeoJSON(fc)} onSurveySelect={handleSurveySelect} selectedVillageName={selectedVillageName} selectedSurveyNo={selectedSurveyNo} />
        </div>
      )}
      <LeafletMap
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        {nightMode ? (
          <>
            {/* ESRI Dark Gray base — free, no key, sharp to zoom 16 */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              attribution='Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
              maxNativeZoom={16}
              maxZoom={20}
            />
            {/* NASA VIIRS city-light glow blended on top */}
            <TileLayer
              url="https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"
              attribution='NASA Earth at Night (GIBS/ESDIS)'
              maxNativeZoom={8}
              maxZoom={20}
              opacity={0.6}
            />
            {/* ESRI Dark Gray labels — free, no key */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              attribution=''
              maxNativeZoom={16}
              maxZoom={20}
            />
          </>
        ) : basemap === "satellite" && mtKey ? (
          <TileLayer
            url={`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${mtKey}`}
            attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={20}
          />
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            subdomains="abc"
            maxZoom={19}
          />
        )}
        <MapController center={center} zoom={zoom} />
        <MapFlyTo bounds={flyBounds} />
        {cadastralEnabled && cadastral && <CadastralLayer visible />}
        {parcelsEnabled && parcelsOn && (
          <EchawadiParcels
            enabled={parcelsOn}
            siteBoundary={siteBoundary}
            onSelect={handleParcelSelectInternal}
            selectedKey={selectedParcelKey}
            toolbarGeoJSON={explorerEnabled ? toolbarGeoJSON : undefined}
          />
        )}
        {explorerEnabled && !parcelsOn && toolbarGeoJSON !== undefined && (
          <EchawadiParcels
            enabled
            siteBoundary={siteBoundary}
            onSelect={handleParcelSelectInternal}
            selectedKey={selectedParcelKey}
            toolbarGeoJSON={toolbarGeoJSON}
          />
        )}
        {parcelsEnabled && showBuildings && (
          <BuildingFootprints enabled={showBuildings} onStatus={setBuildingStatus} siteBoundary={siteBoundary} />
        )}
        {/* Cadastral explorer overlay layers */}
        {explorerEnabled && (
          <>
            <LgdVillagesOverlay enabled={layers.lgdVillages} />
            <EncroachmentOverlay enabled={layers.encroachment} siteBoundary={siteBoundary} />
            <BbmpStormDrainOverlay enabled={layers.bbmpSwd} siteBoundary={siteBoundary} />
            <BwssbSewerageOverlay enabled={layers.bwssb300} siteBoundary={siteBoundary} tier="300+" />
            <BwssbSewerageOverlay enabled={layers.bwssb150} siteBoundary={siteBoundary} tier="150-300" />
            <BwssbSewerageOverlay enabled={layers.bwssbMinor} siteBoundary={siteBoundary} tier="<150" />
            <DrainageOverlay enabled={layers.wrisLakes} siteBoundary={siteBoundary} />
            <GasPipelineOverlay enabled={layers.gas} siteBoundary={siteBoundary} />
            <PowerGridOverlay siteBoundary={siteBoundary} />
            <PowerLinesOverlay enabled={layers.bescom} showLines={false} showZones siteBoundary={siteBoundary} />
            <RoadWidthOverlay enabled={layers.roadWidths} siteBoundary={siteBoundary} />
            <AmenitiesOverlay enabled={layers.amenities} center={amenitiesCenter ?? center} radiusM={2500} />
            <TransportAccessOverlay enabled={layers.transportAccess} center={amenitiesCenter ?? center} radiusM={10000} />
          </>
        )}
        {children}
      </LeafletMap>
      {explorerEnabled && (
        <CadastralLayersPanel layerState={layers} onToggle={toggleLayer} />
      )}
      {/* Map control buttons — layout differs by profile */}
      {profile === "builder" ? (
        /* Builder: glassmorphic grouped panel, mid-left, includes Parcels */
        <div style={{
          position: "absolute", left: 16, ...(controlsAtBottom ? { bottom: 80 } : { top: "50%", transform: "translateY(-50%)" }),
          zIndex: 500, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {mtKey && !nightMode && (
            <button type="button" onClick={() => setBasemap((b) => (b === "street" ? "satellite" : "street"))}
              aria-label="Toggle satellite basemap"
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: basemap === "satellite" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: basemap === "satellite" ? "#3A3F3B" : "rgba(253,252,251,0.55)",
                color: basemap === "satellite" ? "#FDFCFB" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              {basemap === "street" ? "🛰 Satellite" : "🗺 Street"}
            </button>
          )}
          {parcelsEnabled && (
            <button type="button" onClick={() => setBuildingsOn((v) => !v)} aria-label="Toggle OSM building footprints" aria-pressed={buildingsOn}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: buildingsOn ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: buildingsOn ? "#475569" : "rgba(253,252,251,0.55)",
                color: buildingsOn ? "#FFFFFF" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              🏢 Buildings
            </button>
          )}
          {cadastralEnabled && (
            <button type="button" onClick={() => setCadastral((c) => !c)} aria-label="Toggle cadastral parcel grid" aria-pressed={cadastral}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: cadastral ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: cadastral ? "#0F766E" : "rgba(253,252,251,0.55)",
                color: cadastral ? "#FFFFFF" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              🗂 Cadastral
            </button>
          )}
        </div>
      ) : (
        /* Architect: grouped glassmorphic panel, mid-left, larger buttons */
        <div style={{
          position: "absolute", left: 16, ...(controlsAtBottom ? { bottom: 80 } : { top: "50%", transform: "translateY(-50%)" }),
          zIndex: 500, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {mtKey && !nightMode && (
            <button type="button" onClick={() => setBasemap((b) => (b === "street" ? "satellite" : "street"))}
              aria-label="Toggle satellite basemap"
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: basemap === "satellite" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: basemap === "satellite" ? "#3A3F3B" : "rgba(253,252,251,0.55)",
                color: basemap === "satellite" ? "#FDFCFB" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              {basemap === "street" ? "🛰 Satellite" : "🗺 Street"}
            </button>
          )}
          {parcelsEnabled && (
            <button type="button" onClick={() => setBuildingsOn((v) => !v)} aria-label="Toggle OSM building footprints" aria-pressed={buildingsOn}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: buildingsOn ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: buildingsOn ? "#475569" : "rgba(253,252,251,0.55)",
                color: buildingsOn ? "#FFFFFF" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              🏢 Buildings
            </button>
          )}
          {cadastralEnabled && (
            <button type="button" onClick={() => setCadastral((c) => !c)} aria-label="Toggle cadastral parcel grid" aria-pressed={cadastral}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: cadastral ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.6)", borderRadius: 12, fontFamily: "inherit",
                background: cadastral ? "#0F766E" : "rgba(253,252,251,0.55)",
                color: cadastral ? "#FFFFFF" : "#3A3F3B",
                backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
                boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}>
              🗂 Cadastral
            </button>
          )}
        </div>
      )}
      {parcelsEnabled && (parcelsOn || buildingsOn) && (
        <div style={{
          position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 600, width: 260,
          maxHeight: "42vh", overflowY: "auto",
          background: "#FDFCFB", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8,
          padding: "10px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontFamily: "inherit",
        }}>
          {parcelsOn && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7C2D12", marginBottom: 6 }}>
                KGIS Parcels — indicative
              </div>
              <input
                value={parcelFilter}
                onChange={(e) => setParcelFilter(e.target.value)}
                placeholder="Highlight by survey no…"
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 11, padding: "5px 7px",
                  border: "1px solid #CFD6C4", borderRadius: 5, fontFamily: "inherit", marginBottom: 6,
                }}
              />
              <div style={{ fontSize: 11, color: "#3A3F3B", lineHeight: 1.5 }}>
                {parcelStatus === "loading"
                  ? "Querying KGIS parcels…"
                  : parcelStatus == null
                  ? "Draw a site boundary — parcels load for that area."
                  : parcelStatus.status === "too-large"
                  ? <span style={{ color: "#B45309" }}>⚠ {parcelStatus.reason}</span>
                  : parcelStatus.status === "error"
                  ? <span style={{ color: "#C46A6A", fontWeight: 600 }}>⚠ Parcels unavailable — {parcelStatus.reason}</span>
                  : parcelStatus.status === "empty"
                  ? <span style={{ color: "#7B8F83" }}>{parcelStatus.reason}</span>
                  : <span><b>{parcelStatus.parcelCount}</b> parcels · {parcelStatus.count - parcelStatus.parcelCount} roads{parcelStatus.truncated ? " · capped at 1000, draw smaller" : ""} · {Math.round(parcelStatus.elapsedMs)} ms</span>}
              </div>
              {filterMatch === false && (
                <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>
                  Survey “{parcelFilter.trim()}” — not found in this drawn area (filters only the parcels KGIS returned here, not a statewide lookup).
                </div>
              )}
              {typeof parcelStatus === "object" && parcelStatus?.status === "ok" && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,20px)", gridTemplateRows: "repeat(3,20px)", gap: 2 }}>
                    <span />
                    <button style={nb} title="nudge north 1 m" onClick={() => setOffsetN((n) => n + 1)}>▲</button>
                    <span />
                    <button style={nb} title="nudge west 1 m" onClick={() => setOffsetE((e) => e - 1)}>◀</button>
                    <button style={{ ...nb, color: "#B45309" }} title="reset alignment" onClick={() => { setOffsetE(0); setOffsetN(0); }}>⟲</button>
                    <button style={nb} title="nudge east 1 m" onClick={() => setOffsetE((e) => e + 1)}>▶</button>
                    <span />
                    <button style={nb} title="nudge south 1 m" onClick={() => setOffsetN((n) => n - 1)}>▼</button>
                    <span />
                  </div>
                  <div style={{ fontSize: 10, color: "#3A3F3B", lineHeight: 1.4 }}>
                    Align to satellite<br />
                    <b>{offsetE || offsetN ? `${Math.abs(offsetE)} m ${offsetE >= 0 ? "E" : "W"}, ${Math.abs(offsetN)} m ${offsetN >= 0 ? "N" : "S"}` : "no offset"}</b>
                    <div style={{ color: "#7B8F83", fontStyle: "italic" }}>visual aid — data unchanged</div>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 9.5, color: "#7B8F83", marginTop: 8, lineHeight: 1.45 }}>{KGIS_ATTRIBUTION}</div>
              <div style={{ fontSize: 9.5, color: "#B45309", marginTop: 5, lineHeight: 1.45, fontStyle: "italic" }}>{KGIS_LICENSING}</div>
            </>
          )}
          {showBuildings && (
            <>
              <div style={{
                fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 4,
                marginTop: parcelsOn ? 10 : 0, paddingTop: parcelsOn ? 8 : 0,
                borderTop: parcelsOn ? "1px solid #E5E1DA" : "none",
              }}>
                OSM Buildings — structures{buildingFallback ? " (KGIS fallback)" : ""}
              </div>
              {buildingFallback && (
                <div style={{ fontSize: 10, color: "#B45309", marginBottom: 5, lineHeight: 1.45 }}>
                  KGIS returned no parcels here — showing OSM building footprints instead. These are STRUCTURES, not parcels, and carry no survey number.
                </div>
              )}
              <div style={{ fontSize: 11, color: "#3A3F3B", lineHeight: 1.5 }}>
                {buildingStatus === "loading"
                  ? "Querying OSM buildings…"
                  : buildingStatus == null
                  ? "Draw a site boundary — buildings load for that area."
                  : buildingStatus.status === "too-large"
                  ? <span style={{ color: "#B45309" }}>⚠ {buildingStatus.reason}</span>
                  : buildingStatus.status === "error"
                  ? <span style={{ color: "#C46A6A", fontWeight: 600 }}>⚠ Buildings unavailable — {buildingStatus.reason}</span>
                  : buildingStatus.status === "empty"
                  ? <span style={{ color: "#7B8F83" }}>{buildingStatus.reason}</span>
                  : <span><b>{buildingStatus.count}</b> building footprints · {Math.round(buildingStatus.elapsedMs)} ms</span>}
              </div>
              <div style={{ fontSize: 9.5, color: "#7B8F83", marginTop: 8, lineHeight: 1.45 }}>{OSM_ATTRIBUTION}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
