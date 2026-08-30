// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleMarker, Tooltip } from "react-leaflet";
import { getSession } from "next-auth/react";

const GEO_BASE = process.env.NEXT_PUBLIC_GEO_API_URL ?? "http://localhost:8005";

interface RawPt  { name: string; type: string; distance_m: number; lat?: number; lon?: number }
interface RawCat { count: number; nearest_m: number; top_5: RawPt[]; points?: RawPt[] }
interface RawData {
  healthcare: RawCat; education: RawCat; retail: RawCat;
  finance: RawCat; recreation: RawCat; religious: RawCat; transport: RawCat;
  total_count: number;
}

interface Pt { name: string; type: string; category: string; distanceM: number; lat: number; lon: number }

export const CAT_COLOR: Record<string, string> = {
  healthcare: "#c62828",
  education:  "#1565c0",
  transport:  "#2e7d32",
  retail:     "#e65100",
  finance:    "#4a148c",
  recreation: "#004d40",
  religious:  "#795548",
};

const CAT_LABEL: Record<string, string> = {
  healthcare: "Healthcare", education: "Education", transport: "Transport",
  retail: "Retail",        finance: "Finance",     recreation: "Recreation",
  religious: "Religious",
};

const ALL_CATS = Object.keys(CAT_COLOR);

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

interface Props {
  enabled:  boolean;
  center?:  [number, number];
  radiusM?: number;
}

export function AmenitiesOverlay({ enabled, center, radiusM = 2500 }: Props) {
  const [points,  setPoints]  = useState<Pt[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [active,  setActive]  = useState<Set<string>>(new Set(ALL_CATS));
  const [mounted, setMounted] = useState(false);
  const ctrlRef  = useRef<AbortController | null>(null);
  const cacheKey = useRef<string>("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!enabled || !center) {
      ctrlRef.current?.abort();
      setPoints([]);
      setLoading(false);
      return;
    }
    const key = `${center[0].toFixed(5)},${center[1].toFixed(5)},${radiusM}`;
    if (key === cacheKey.current) return;

    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    cacheKey.current = key;
    setLoading(true);
    setPoints([]);
    setFetchErr(null);

    getSession().then((session) => {
    const authHeader: Record<string, string> = session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
    fetch(`${GEO_BASE}/geo/amenities?lat=${center[0]}&lon=${center[1]}&radius_m=${radiusM}`, {
      headers: authHeader,
      signal: ctrl.signal,
    })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: RawData) => {
        if (ctrl.signal.aborted) return;
        const pts: Pt[] = [];
        for (const cat of ALL_CATS) {
          const bucket = data[cat as keyof RawData] as RawCat | undefined;
          if (!bucket) continue;
          const items = bucket.points ?? bucket.top_5 ?? [];
          for (const it of items) {
            if (it.lat == null || it.lon == null) continue;
            pts.push({
              name: it.name || it.type, type: it.type,
              category: cat, distanceM: it.distance_m,
              lat: it.lat, lon: it.lon,
            });
          }
        }
        setPoints(pts);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (ctrl.signal?.aborted) return;
        setFetchErr(e.message === "403" ? "Flag off — start geo with feature.geo.amenities" : `Error: ${e.message}`);
        setLoading(false);
      });
    });

    return () => {
      ctrl.abort();
      cacheKey.current = ""; // reset so re-mount (Strict Mode) or prop change can start fresh
    };
  }, [enabled, center, radiusM]);

  function toggleCat(cat: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const visible = enabled ? points.filter((p) => active.has(p.category)) : [];
  const counts: Record<string, number> = {};
  for (const p of points) counts[p.category] = (counts[p.category] ?? 0) + 1;

  const dock = (
    <div style={{
      position: "fixed", bottom: 24, right: 252, zIndex: 1150,
      background: "rgba(253,252,251,0.55)",
      backdropFilter: "blur(14px) saturate(160%)",
      WebkitBackdropFilter: "blur(14px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.6)",
      borderRadius: 12,
      boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
      padding: "10px 12px", fontFamily: "system-ui, sans-serif",
      width: 198, maxHeight: "60vh", overflowY: "auto",
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#306223", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <span>Amenities</span>
        {!loading && points.length > 0 && (
          <span style={{ fontWeight: 400, color: "#7B8F83" }}>{points.length}</span>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 10, color: "#7B8F83" }}>Fetching amenities…</div>
      )}
      {!loading && fetchErr && (
        <div style={{ fontSize: 10, color: "#c62828" }}>{fetchErr}</div>
      )}
      {!loading && !fetchErr && points.length === 0 && center && (
        <div style={{ fontSize: 10, color: "#7B8F83" }}>No amenities found nearby</div>
      )}
      {!loading && !fetchErr && !center && (
        <div style={{ fontSize: 10, color: "#7B8F83" }}>Drop a site pin to load</div>
      )}

      {ALL_CATS.map((cat) => {
        const count = counts[cat] ?? 0;
        if (count === 0) return null;
        return (
          <label key={cat} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 4 }}>
            <input
              type="checkbox" checked={active.has(cat)} onChange={() => toggleCat(cat)}
              style={{ cursor: "pointer", accentColor: CAT_COLOR[cat], flexShrink: 0 }}
            />
            <span style={{
              width: 9, height: 9, borderRadius: "50%", display: "inline-block",
              background: CAT_COLOR[cat], flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: "#3A3F3B", flex: 1 }}>{CAT_LABEL[cat]}</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: "0px 5px", borderRadius: 3,
              background: "#F2EDE8", color: "#7B8F83",
            }}>{count}</span>
          </label>
        );
      })}

      {!loading && points.length > 0 && (
        <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 6, lineHeight: 1.4 }}>
          OpenStreetMap · indicative
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Circle markers inside Leaflet map context */}
      {visible.map((p, i) => (
        <CircleMarker
          key={`${p.category}-${i}`}
          center={[p.lat, p.lon]}
          radius={6}
          pathOptions={{
            color: "#fff", weight: 1.5,
            fillColor: CAT_COLOR[p.category] ?? "#95BC9C", fillOpacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, lineHeight: 1.5 }}>
              <b style={{ color: "#3A3F3B" }}>{p.name}</b>
              <div style={{ color: "#7B8F83" }}>{p.type} · {CAT_LABEL[p.category]}</div>
              <div style={{ fontWeight: 700, color: CAT_COLOR[p.category] }}>{fmtDist(p.distanceM)} away</div>
              <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 1 }}>OpenStreetMap · indicative</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Filter dock — portaled to body to escape Leaflet CSS transforms */}
      {enabled && mounted && createPortal(dock, document.body)}
    </>
  );
}
