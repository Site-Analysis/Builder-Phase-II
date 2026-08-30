// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleMarker, Tooltip } from "react-leaflet";
import { fetchTransportAccess, type TransportAccessResult, type TransportFeature } from "@/lib/api/analysis";

const CATS = {
  metro:   { label: "Metro",   color: "#7B1FA2", radius: 9  },
  rail:    { label: "Rail",    color: "#B71C1C", radius: 9  },
  highway: { label: "Highway", color: "#E65100", radius: 7  },
  airport: { label: "Airport", color: "#0D47A1", radius: 12 },
} as const;

type CatKey = keyof typeof CATS;
const ALL_CATS = Object.keys(CATS) as CatKey[];

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

interface Props {
  enabled:  boolean;
  center?:  [number, number] | null;
  radiusM?: number;
}

export function TransportAccessOverlay({ enabled, center, radiusM = 10000 }: Props) {
  const [data,    setData]    = useState<TransportAccessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [active,  setActive]  = useState<Set<CatKey>>(new Set(ALL_CATS));
  const [mounted, setMounted] = useState(false);
  const ctrlRef  = useRef<AbortController | null>(null);
  const cacheKey = useRef<string>("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!enabled || !center) {
      ctrlRef.current?.abort();
      setData(null);
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
    setData(null);
    setFetchErr(null);

    fetchTransportAccess(center[0], center[1], radiusM)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        setData(result);
        if (!result) setFetchErr("No data returned");
        setLoading(false);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        const msg = e.message;
        setFetchErr(msg.includes("403") || msg.includes("Feature flag")
          ? "Flag off — enable feature.geo.transport-access"
          : `Error: ${msg}`);
        setLoading(false);
      });

    return () => {
      ctrl.abort();
      cacheKey.current = "";
    };
  }, [enabled, center, radiusM]);

  function toggleCat(cat: CatKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // Flatten features for map markers
  const markers: { feat: TransportFeature; cat: CatKey }[] = [];
  if (data && enabled) {
    for (const cat of ALL_CATS) {
      if (!active.has(cat)) continue;
      const catData = data[cat];
      for (const feat of catData.features) {
        markers.push({ feat, cat });
      }
    }
  }

  const dock = (
    <div style={{
      position: "fixed", bottom: 24, right: 462, zIndex: 1150,
      background: "rgba(253,252,251,0.55)",
      backdropFilter: "blur(14px) saturate(160%)",
      WebkitBackdropFilter: "blur(14px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.6)",
      borderRadius: 12,
      boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
      padding: "10px 12px", fontFamily: "system-ui, sans-serif",
      width: 210,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#306223", marginBottom: 6 }}>
        Transport Access
      </div>

      {loading && (
        <div style={{ fontSize: 10, color: "#7B8F83" }}>Fetching transport…</div>
      )}
      {!loading && fetchErr && (
        <div style={{ fontSize: 10, color: "#c62828" }}>{fetchErr}</div>
      )}
      {!loading && !fetchErr && !center && (
        <div style={{ fontSize: 10, color: "#7B8F83" }}>Drop a site pin to load</div>
      )}

      {!loading && !fetchErr && data && ALL_CATS.map((cat) => {
        const catData = data[cat];
        const nearest = catData.nearest;
        return (
          <label key={cat} style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer", marginBottom: 6 }}>
            <input
              type="checkbox" checked={active.has(cat)} onChange={() => toggleCat(cat)}
              style={{ cursor: "pointer", accentColor: CATS[cat].color, flexShrink: 0, marginTop: 2 }}
            />
            <span style={{
              width: 9, height: 9, borderRadius: "50%", display: "inline-block",
              background: CATS[cat].color, flexShrink: 0, marginTop: 3,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#3A3F3B", fontWeight: 600 }}>{CATS[cat].label}</div>
              {catData.status === "resolved" && nearest ? (
                <>
                  <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {nearest.name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: CATS[cat].color }}>
                    {fmtDist(nearest.distance_m)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: "#B8C4BB" }}>None within {Math.round(radiusM / 1000)} km</div>
              )}
            </div>
          </label>
        );
      })}

      {!loading && !fetchErr && data && (
        <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 4, lineHeight: 1.4 }}>
          OSM · straight-line · indicative
        </div>
      )}
    </div>
  );

  return (
    <>
      {markers.map((m, i) => (
        <CircleMarker
          key={`transport-${m.cat}-${i}`}
          center={[m.feat.lat, m.feat.lon]}
          radius={CATS[m.cat].radius}
          pathOptions={{
            color: "#fff", weight: 1.5,
            fillColor: CATS[m.cat].color, fillOpacity: 0.88,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, lineHeight: 1.5 }}>
              <b style={{ color: "#3A3F3B" }}>{m.feat.name}</b>
              <div style={{ color: "#7B8F83" }}>{CATS[m.cat].label}</div>
              <div style={{ fontWeight: 700, color: CATS[m.cat].color }}>{fmtDist(m.feat.distance_m)} away</div>
              <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 1 }}>
                {m.feat.confidence === "authoritative" ? "Authoritative (AAI ARP)" : "OpenStreetMap · indicative"}
              </div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {enabled && mounted && createPortal(dock, document.body)}
    </>
  );
}
