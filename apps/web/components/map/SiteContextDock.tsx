// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  fetchParcelZone, fetchRingContext, fetchAuthority,
  type ParcelZone, type RingContext, type AuthorityResult,
} from "@/lib/api/analysis";

const GLASS: React.CSSProperties = {
  position: "fixed",
  bottom: 76,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 1100,
  background: "rgba(253,252,251,0.55)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.6)",
  borderRadius: 12,
  boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
  fontFamily: "system-ui, sans-serif",
  width: 480,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const ROW: React.CSSProperties = {
  display: "flex",
};

const DIVIDER: React.CSSProperties = {
  borderTop: "1px solid rgba(207,214,196,0.35)",
};

const ZONE_COLOR: Record<string, string> = {
  "Residential":   "#1565c0",
  "Commercial":    "#e65100",
  "Industrial":    "#795548",
  "Agricultural":  "#2e7d32",
  "Mixed Use":     "#6a1b9a",
  "Green Belt":    "#004d40",
  "Institutional": "#0277bd",
  "Water Body":    "#00838f",
  "Restricted":    "#c62828",
  "Unknown":       "#7B8F83",
};

const CONF_COLOR: Record<string, string> = {
  authoritative: "#166534",
  derived:       "#92400e",
  inferred:      "#92400e",
  unresolved:    "#6b7280",
};
const CONF_BG: Record<string, string> = {
  authoritative: "rgba(240,253,244,0.85)",
  derived:       "rgba(255,251,235,0.85)",
  inferred:      "rgba(255,251,235,0.85)",
  unresolved:    "rgba(243,244,246,0.85)",
};

const JURIS_COLOR: Record<string, string> = {
  "Urban":   "#0277bd",
  "Rural":   "#2e7d32",
  "Unknown": "#7B8F83",
};

function Cell({ label, children, borderRight }: { label: string; children: React.ReactNode; borderRight?: boolean }) {
  return (
    <div style={{
      flex: 1, padding: "10px 14px",
      borderRight: borderRight ? "1px solid rgba(207,214,196,0.35)" : "none",
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#7B8F83", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 5,
      fontSize: 11, fontWeight: 700, color, background: bg,
    }}>
      {text}
    </span>
  );
}

function SmallPill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 5px", borderRadius: 3,
      fontSize: 9.5, fontWeight: 700, color, background: bg,
    }}>
      {text}
    </span>
  );
}

function SkeletonPill() {
  return (
    <span style={{
      display: "inline-block", width: 72, height: 20, borderRadius: 5,
      background: "rgba(207,214,196,0.35)",
    }} />
  );
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function portalDomain(url: string | null): string | null {
  if (!url) return null;
  // Extract meaningful short form: "https://bpas.bbmpgov.in (BPAS / AutoDCR)" → "bpas.bbmpgov.in"
  const m = url.match(/https?:\/\/([^/\s)]+)/);
  return m ? m[1] : null;
}

interface Props {
  lat: number;
  lon: number;
}

export function SiteContextDock({ lat, lon }: Props) {
  const [zone,      setZone]      = useState<ParcelZone | null>(null);
  const [ring,      setRing]      = useState<RingContext | null>(null);
  const [authority, setAuthority] = useState<AuthorityResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [shown,     setShown]     = useState(false);
  const [err,       setErr]       = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const [minimized, setMinimized] = useState(false);
  const ctrlRef  = useRef<AbortController | null>(null);
  const cacheKey = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (key === cacheKey.current) return;

    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    cacheKey.current = key;

    setZone(null);
    setRing(null);
    setAuthority(null);
    setErr(false);

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { if (!ctrl.signal.aborted) { setLoading(true); setShown(true); } }, 200);

    Promise.all([
      fetchParcelZone(lat, lon),
      fetchRingContext(lat, lon),
      fetchAuthority(lat, lon),
    ]).then(([z, r, a]) => {
      if (ctrl.signal.aborted) return;
      if (debounce.current) clearTimeout(debounce.current);
      setZone(z);
      setRing(r);
      setAuthority(a);
      setLoading(false);
      setShown(true);
      if (!z && !r && !a) setErr(true);
    }).catch(() => {
      if (ctrl.signal.aborted) return;
      setLoading(false);
      setErr(true);
    });

    return () => {
      ctrl.abort();
      cacheKey.current = "";
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [lat, lon]);

  if (!mounted || !shown) return null;

  const zoneColor = ZONE_COLOR[zone?.zone_class ?? ""] ?? "#7B8F83";
  const zoneBg    = `${zoneColor}18`;
  const confColor = CONF_COLOR[zone?.source_confidence ?? ""] ?? "#6b7280";
  const confBg    = CONF_BG[zone?.source_confidence ?? ""] ?? "rgba(243,244,246,0.85)";

  const authConfColor = CONF_COLOR[authority?.confidence ?? ""] ?? "#6b7280";
  const authConfBg    = CONF_BG[authority?.confidence ?? ""] ?? "rgba(243,244,246,0.85)";
  const jurisColor    = JURIS_COLOR[authority?.jurisdiction_type ?? ""] ?? "#7B8F83";

  const dock = err ? (
    <div style={{ ...GLASS, width: "auto", padding: "10px 16px" }}>
      <span style={{ fontSize: 11, color: "#7B8F83" }}>Zone data unavailable — geo service may be offline</span>
    </div>
  ) : (
    <div style={GLASS}>
      {/* ── Minimize bar ── */}
      <div
        onClick={() => setMinimized((m) => !m)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px 4px",
          cursor: "pointer",
          borderBottom: minimized ? "none" : "1px solid rgba(207,214,196,0.25)",
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#9BA8A0", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Site Context
        </span>
        <span style={{ fontSize: 10, color: "#B8C4BB", lineHeight: 1 }}>
          {minimized ? "▲" : "▼"}
        </span>
      </div>

      {/* ── Collapsible content ── */}
      {!minimized && <>
      {/* ── Row 1: Land Use / Master Plan / Ring-TDR ── */}
      <div style={ROW}>
        <Cell label="Land Use" borderRight>
          {loading ? <SkeletonPill /> : zone ? (
            <>
              <Pill text={zone.zone_class} color={zoneColor} bg={zoneBg} />
              {zone.na_order_required && (
                <span style={{ marginLeft: 5, fontSize: 9.5, fontWeight: 700, color: "#92400e", background: "rgba(255,251,235,0.85)", padding: "1px 5px", borderRadius: 3 }}>NA req</span>
              )}
              <div style={{ fontSize: 10, color: "#9BA8A0", marginTop: 4 }}>
                {zone.permitted_uses.slice(0, 2).join(" · ") || "—"}
              </div>
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>

        <Cell label="Master Plan" borderRight>
          {loading ? <SkeletonPill /> : zone ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#3A3F3B" }}>
                  {zone.zone_authority?.startsWith("BDA") ? zone.zone_class : (zone.zone_class || "—")}
                </span>
                <Pill text={zone.source_confidence} color={confColor} bg={confBg} />
              </div>
              <div style={{ fontSize: 9.5, color: "#9BA8A0", marginTop: 3 }}>
                {zone.zone_authority ?? "source unknown"}
              </div>
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>

        <Cell label="Ring / TDR">
          {loading ? <SkeletonPill /> : ring ? (
            <>
              {ring.status === "resolved" && ring.ring ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Pill text={`Ring ${ring.ring}`} color="#306223" bg="rgba(48,98,35,0.10)" />
                    {ring.tdr_zone && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#3A3F3B" }}>
                        TDR Zone {ring.tdr_zone}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9.5, color: "#9BA8A0", marginTop: 3 }}>inferred · OSM-derived</div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: "#9BA8A0" }}>Unresolved</span>
                  {ring.reason && <div style={{ fontSize: 9.5, color: "#9BA8A0", marginTop: 2 }}>{ring.reason}</div>}
                </>
              )}
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>
      </div>

      {/* ── Row 2: Governing Authority / Approval Track / Bye-laws ── */}
      <div style={DIVIDER} />
      <div style={ROW}>
        <Cell label="Governing Authority" borderRight>
          {loading ? <SkeletonPill /> : authority ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 3 }}>
                <SmallPill
                  text={authority.jurisdiction_type}
                  color={jurisColor}
                  bg={`${jurisColor}15`}
                />
                <SmallPill
                  text={authority.confidence}
                  color={authConfColor}
                  bg={authConfBg}
                />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3A3F3B", lineHeight: 1.3 }}>
                {truncate(authority.authority, 45)}
              </div>
              {!authority.live_verified && (
                <div style={{ fontSize: 9, color: "#B8C4BB", marginTop: 2 }}>not PIP-verified</div>
              )}
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>

        <Cell label="Approval Track" borderRight>
          {loading ? <SkeletonPill /> : authority ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#3A3F3B", lineHeight: 1.4 }}>
                {truncate(authority.approval_track, 60)}
              </div>
              {authority.planning_authority && (
                <div style={{ fontSize: 9.5, color: "#9BA8A0", marginTop: 3, lineHeight: 1.3 }}>
                  {truncate(authority.planning_authority, 62)}
                </div>
              )}
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>

        <Cell label="Bye-laws">
          {loading ? <SkeletonPill /> : authority ? (
            <>
              <div style={{ fontSize: 10.5, color: "#3A3F3B", lineHeight: 1.4 }}>
                {truncate(authority.bye_law_reference, 72)}
              </div>
              {portalDomain(authority.portal) && (
                <div style={{ fontSize: 9.5, color: "#9BA8A0", marginTop: 3 }}>
                  {portalDomain(authority.portal)}
                </div>
              )}
            </>
          ) : <span style={{ fontSize: 11, color: "#9BA8A0" }}>—</span>}
        </Cell>
      </div>

      </>}
    </div>
  );

  return createPortal(dock, document.body);
}
