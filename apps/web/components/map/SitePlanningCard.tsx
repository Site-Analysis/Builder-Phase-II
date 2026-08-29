// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef, useState } from "react";
import { CircleMarker, Popup } from "react-leaflet";
import type L from "leaflet";
import { fetchParcelZone, fetchRawPlanning, type RawPlanningResult } from "@/lib/api/analysis";

interface Props {
  lat: number;
  lon: number;
  plotAreaSqm: number | null;
  plotDims: { nsM: number; ewM: number } | null;
}

function fmtSetback(v: number | undefined | null): string {
  if (v == null) return "—";
  return `${v}m`;
}

interface PremiumFarResult {
  pct: number;
  // non-null when road width is estimated — shows [min, max] premium pct across plausible bands
  pctRange: [number, number] | null;
  tdrExtra: boolean;
  note: string;
}

function calcPremiumFar(roadWidthM: number, roadSrc: string): PremiumFarResult {
  // Road width estimated at 9 m (OSM tag absent) — show range 20–40% across 9–18 m bands
  if (roadSrc === "default_9m")
    return { pct: 0, pctRange: [0.20, 0.40], tdrExtra: false, note: "Road width unconfirmed — estimate based on 9–18 m band" };
  if (roadWidthM < 9)  return { pct: 0,    pctRange: null, tdrExtra: false, note: "Road < 9 m — premium not available" };
  if (roadWidthM < 12) return { pct: 0.20, pctRange: null, tdrExtra: false, note: "20% uplift · 9–12 m band" };
  if (roadWidthM < 18) return { pct: 0.40, pctRange: null, tdrExtra: false, note: "40% uplift · 12–18 m band" };
  return { pct: 0.40, pctRange: null, tdrExtra: true, note: "40% uplift + 20% via TDR · > 18 m band" };
}

function fmtRoadSrc(src: string | undefined): string {
  if (src === "osm_detected") return "OSM";
  if (src === "user_input")   return "user";
  if (src === "default_9m")   return "est.";
  return src ?? "—";
}

const VAL: React.CSSProperties = {
  fontSize: 15, fontWeight: 800, color: "#1a2010", lineHeight: 1.1,
};
const LBL: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, color: "#8a9485", letterSpacing: "0.06em",
  textTransform: "uppercase", marginBottom: 2,
};
const SUB: React.CSSProperties = {
  fontSize: 9.5, color: "#aab5a5", marginTop: 1,
};
const HR: React.CSSProperties = {
  borderTop: "1px solid #e8ece5", margin: "8px 0",
};
const SKEL: React.CSSProperties = {
  display: "inline-block", height: 13, borderRadius: 3,
  background: "rgba(200,205,198,0.5)", verticalAlign: "middle",
};

export function SitePlanningCard({ lat, lon, plotAreaSqm, plotDims }: Props) {
  const [data,    setData]    = useState<RawPlanningResult | null>(null);
  const [zone,    setZone]    = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(false);
  const ctrlRef   = useRef<AbortController | null>(null);
  const cacheKey  = useRef("");
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)},${plotAreaSqm ?? "null"}`;
    if (key === cacheKey.current) return;

    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    cacheKey.current = key;

    setData(null);
    setZone(null);
    setErr(false);
    setLoading(true);

    (async () => {
      const z = await fetchParcelZone(lat, lon);
      if (ctrl.signal.aborted) return;
      const rawZone = z?.zone_class ?? undefined;
      setZone(rawZone ?? null);
      const VALID_ZONES = new Set(["Residential", "Commercial", "Industrial", "Mixed Use", "Institutional"]);
      const zClass = rawZone && VALID_ZONES.has(rawZone) ? rawZone : undefined;

      const p = await fetchRawPlanning(lat, lon, plotAreaSqm ?? 200, zClass);
      if (ctrl.signal.aborted) return;

      setLoading(false);
      if (!p) { setErr(true); return; }
      setData(p);
    })();

    return () => {
      ctrl.abort();
      cacheKey.current = "";
    };
  }, [lat, lon, plotAreaSqm]);

  // Defer past react-leaflet's own popup-binding effects before calling openPopup.
  useEffect(() => {
    const t = setTimeout(() => {
      try { markerRef.current?.openPopup(); } catch { /* map may not be ready */ }
    }, 0);
    return () => clearTimeout(t);
  }, [lat, lon]);

  const areaLabel = plotAreaSqm != null
    ? `${Math.round(plotAreaSqm)} m² (drawn)`
    : "200 m² (assumed)";

  const dimLabel = plotDims
    ? `~${Math.round(plotDims.nsM)} × ${Math.round(plotDims.ewM)} m (bbox)`
    : null;

  const popupContent = err ? (
    <div style={{ fontSize: 11, color: "#9BA8A0", padding: "2px 0" }}>
      Planning data unavailable — service may be offline
    </div>
  ) : loading ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[90, 60, 80, 50, 70].map((w, i) => (
        <div key={i} style={{ ...SKEL, width: w }} />
      ))}
    </div>
  ) : data ? (
    <>
      {/* Premium FAR — computed client-side from road-width band (UDD 78 MNJ 2024(E)) */}
      {(() => {
        const prem = calcPremiumFar(data.road_width_used_m, data.road_width_source ?? "");
        const base = data.far_applicable;
        const area = plotAreaSqm ?? 200;
        // Confirmed premium (road width known)
        const premFarValue = prem.pct > 0 ? +(base * (1 + prem.pct)).toFixed(2) : null;
        const premBuildable = premFarValue != null ? Math.round(premFarValue * area) : null;
        // Estimated range (road width defaulted)
        const premFarRange = prem.pctRange
          ? [+(base * (1 + prem.pctRange[0])).toFixed(2), +(base * (1 + prem.pctRange[1])).toFixed(2)] as [number, number]
          : null;
        const premBuildableRange = premFarRange
          ? [Math.round(premFarRange[0] * area), Math.round(premFarRange[1] * area)] as [number, number]
          : null;

        return (
          <>
            {/* Row 1: FAR / Coverage / Height */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <div>
                <div style={LBL}>FAR / FSI</div>
                <div style={VAL}>{data.far_applicable}</div>
                {premFarValue != null ? (
                  <div style={{ fontSize: 10, color: "#166534", fontWeight: 700, marginTop: 2 }}>
                    → {premFarValue} premium
                  </div>
                ) : premFarRange != null ? (
                  <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginTop: 2 }}>
                    → {premFarRange[0]}–{premFarRange[1]} est.
                  </div>
                ) : null}
                <div style={SUB}>
                  {data.tod_applicable ? "BDA TOD" : (data.far_source ?? "RMP-2015").split("+")[0].trim().slice(0, 16)}
                  {premFarValue != null ? " + prem." : premFarRange != null ? " + prem. est." : ""}
                </div>
              </div>
              <div>
                <div style={LBL}>Ground Cov.</div>
                <div style={VAL}>{Math.round(data.ground_coverage_max * 100)}%</div>
                <div style={SUB}>NBC 2016</div>
              </div>
              <div>
                <div style={LBL}>Max Height</div>
                <div style={VAL}>{data.max_height_m} m</div>
                <div style={SUB}>{(data.height_limiting_factor ?? "NBC 2016").slice(0, 16)}</div>
              </div>
            </div>

            <div style={HR} />

            {/* Row 2: Setbacks / Road width / TOD */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <div>
                <div style={LBL}>Setbacks</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2010", lineHeight: 1.55 }}>
                  F {fmtSetback(data.setback_front_m)}<br />
                  R {fmtSetback(data.setback_rear_m)}<br />
                  S {fmtSetback(data.setback_side_m)}
                </div>
              </div>
              <div>
                <div style={LBL}>Road Width</div>
                <div style={VAL}>{data.road_width_used_m} m</div>
                <div style={{ ...SUB, color: data.road_width_source === "default_9m" ? "#b45309" : "#aab5a5" }}>
                  {fmtRoadSrc(data.road_width_source)}
                  {data.road_width_source === "default_9m" && " ⚠"}
                </div>
              </div>
              <div>
                <div style={LBL}>TOD</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: data.tod_applicable ? "#166534" : "#9BA8A0" }}>
                  {data.tod_applicable
                    ? (data.metro_distance_m != null ? `✓ ${Math.round(data.metro_distance_m)} m` : "✓")
                    : "—"}
                </div>
                {data.tod_applicable && data.metro_station_name && (
                  <div style={{ ...SUB, fontSize: 9 }}>{data.metro_station_name.slice(0, 18)}</div>
                )}
              </div>
            </div>

            <div style={HR} />

            {/* Row 3: Plot area / Buildable */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div>
                <div style={LBL}>Plot Area</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2010" }}>{areaLabel}</div>
                {dimLabel && <div style={SUB}>{dimLabel}</div>}
              </div>
              <div>
                <div style={LBL}>Buildable Area</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2010" }}>
                  {Math.round(data.buildable_area_sqm).toLocaleString()} m²
                </div>
                {premBuildable != null ? (
                  <div style={{ fontSize: 9.5, color: "#166534", fontWeight: 700, marginTop: 1 }}>
                    → {premBuildable.toLocaleString()} m² w/premium
                  </div>
                ) : premBuildableRange != null ? (
                  <div style={{ fontSize: 9.5, color: "#b45309", fontWeight: 700, marginTop: 1 }}>
                    → {premBuildableRange[0].toLocaleString()}–{premBuildableRange[1].toLocaleString()} m² est.
                  </div>
                ) : null}
                <div style={SUB}>
                  {zone ?? "Residential"}
                  {premFarValue != null ? ` · FAR ${base}→${premFarValue}` : premFarRange != null ? ` · FAR ${base}→${premFarRange[0]}–${premFarRange[1]} est.` : ""}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 9, color: "#bbc4b6", borderTop: "1px solid #edf0eb", paddingTop: 5 }}>
              NBC 2016 + BDA RMP-2015 · not a permit
              {(premFarValue != null || premFarRange != null) && (
                <> · Premium FAR: indicative · UDD 78 MNJ 2024(E) · requires BDA purchase</>
              )}
              {premFarRange != null && (
                <> · Measure road width on-site to confirm band</>
              )}
              {prem.tdrExtra && premFarValue != null && (
                <> · TDR +20% additionally available (unpriced)</>
              )}
            </div>
          </>
        );
      })()}
    </>
  ) : null;

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={5}
      pathOptions={{ color: "#306223", fillColor: "#306223", fillOpacity: 1, weight: 2 }}
      ref={markerRef}
    >
      <Popup
        minWidth={260}
        maxWidth={280}
        closeButton
        autoClose={false}
        closeOnClick={false}
      >
        <div style={{ padding: "2px 0", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#3A3F3B", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Site Planning Norms
          </div>
          {popupContent}
        </div>
      </Popup>
    </CircleMarker>
  );
}
