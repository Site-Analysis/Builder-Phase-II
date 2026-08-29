// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// SLICE 1 — the JOIN's proof surface. A parcel CLICK only selects (this dock appears with its
// survey no); an explicit "Analyze this parcel" button runs the verdict + the map's signal panels.
// Honest by shape: no verdict is shown until the button is pressed, a down report service renders
// "unavailable — not faked" (never a fabricated GO), and the KGIS indicative caveat is always present.

import { useRef, useState, useEffect } from "react";
import type { SelectedParcel, EchawadiRecords } from "@/lib/stores/parcel";
import { VERDICT_COLOR, CONFIDENCE_BADGE, type ReportResponse } from "@/lib/api/report";
import { fetchParcelZone, type ParcelZone } from "@/lib/api/analysis";

export interface ParcelVerdictState {
  analyzing: boolean;
  verdict: ReportResponse | null;
  error: string | null;
}

interface Props {
  selected: SelectedParcel | null;
  state: ParcelVerdictState;
  echawadiRecords?: EchawadiRecords | null;
  onAnalyze: () => void;
  onClear: () => void;
}

function fmtArea(m2: number): string {
  if (!m2 || m2 <= 0) return "—";
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`;
}

const CONF_COLOR: Record<string, string> = {
  authoritative: "#1a7f37", derived: "#3f7d3f", inferred: "#b58100", unresolved: "#6b7280",
};

export function ParcelVerdictDock({ selected, state, echawadiRecords, onAnalyze, onClear }: Props) {
  // Draggable: null = default center-bottom position; set to {x,y} once user drags.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ mx: number; my: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      setDragPos({
        x: dragOrigin.current.x + e.clientX - dragOrigin.current.mx,
        y: dragOrigin.current.y + e.clientY - dragOrigin.current.my,
      });
    };
    const onUp = () => { dragOrigin.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Reset drag position when selection changes so it snaps back to center-bottom.
  useEffect(() => { setDragPos(null); }, [selected]);

  const [zone, setZone]               = useState<ParcelZone | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);

  useEffect(() => {
    if (!selected) { setZone(null); return; }
    setZoneLoading(true);
    setZone(null);
    const [lat, lon] = selected.centroid;
    fetchParcelZone(lat, lon).then((z) => { setZone(z); setZoneLoading(false); });
  }, [selected]);

  if (!selected) return null;
  const { analyzing, verdict, error } = state;
  const v = verdict?.verdict ?? null;
  const openCases = (echawadiRecords?.rccms ?? []).filter(
    (c) => !["closed", "disposed", "disposed of"].includes((c.case_status ?? "").toLowerCase()),
  ).length;
  const mutCount = echawadiRecords?.mutations?.length ?? 0;
  const isEncroached = echawadiRecords?.encroachmentFlagged === true;

  const posStyle: React.CSSProperties = dragPos
    ? { position: "fixed", top: dragPos.y, left: dragPos.x, transform: "none" }
    : { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      style={{
        ...posStyle, zIndex: 1000, width: 320, maxWidth: "calc(100vw - 24px)",
        background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 14, fontFamily: "system-ui",
      }}
      role="dialog"
      aria-label="Selected parcel verdict"
    >
      {/* header ─────────────────────────────────────────── */}
      <div
        onMouseDown={(e) => {
          const rect = (e.currentTarget.closest("[role=dialog]") as HTMLElement).getBoundingClientRect();
          dragOrigin.current = { mx: e.clientX, my: e.clientY, x: rect.left, y: rect.top };
          e.preventDefault();
        }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, cursor: "grab" }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#7C2D12" }}>
            {selected.hasSurvey ? `Parcel · survey no ${selected.surveyNumber}` : "Parcel · no survey no"}
          </div>
          <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 2 }}>
            {selected.category || "Parcel"} · {fmtArea(selected.areaSqm)}
            {selected.villageCode ? ` · village ${selected.villageCode}` : ""}
          </div>
        </div>
        <button
          type="button" onClick={onClear} aria-label="Clear selection"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "#7B8F83", lineHeight: 1, padding: 2 }}
        >×</button>
      </div>

      {/* e-Chawadi land record chips ─────────────────────── */}
      {echawadiRecords && !echawadiRecords.loading && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {isEncroached && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: "#b3261e", color: "#fff" }}>
              ⚠ Encroachment flagged
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
            background: openCases > 0 ? "#FEF3C7" : "#F0FDF4",
            color: openCases > 0 ? "#92400E" : "#166534",
            border: `1px solid ${openCases > 0 ? "#FCD34D" : "#86EFAC"}`,
          }}>
            {openCases > 0 ? `${openCases} open RCCMS case${openCases > 1 ? "s" : ""}` : "No open RCCMS cases"}
          </span>
          {mutCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#EFF6FF", color: "#1E40AF", border: "1px solid #BFDBFE" }}>
              {mutCount} mutation{mutCount > 1 ? "s" : ""} on record
            </span>
          )}
          {echawadiRecords.villageInfo?.village_name && (
            <span style={{ fontSize: 10, color: "#7B8F83" }}>
              {echawadiRecords.villageInfo.village_name}
            </span>
          )}
        </div>
      )}
      {echawadiRecords?.loading && (
        <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 6 }}>Loading Bhoomi records…</div>
      )}

      {!selected.hasSurvey && (
        <div style={{ fontSize: 10.5, color: "#8a5a2a", marginTop: 6, lineHeight: 1.4 }}>
          KGIS has no survey number for this feature (road / kharab). Still selectable — the verdict runs on its geometry.
        </div>
      )}

      {/* Permitted use ──────────────────────────────────── */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #F0EDE9" }}>
        {zoneLoading ? (
          <div style={{ fontSize: 10, color: "#7B8F83" }}>Fetching zone…</div>
        ) : zone ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#3A3F3B" }}>{zone.zone_class}</span>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                color: "#fff", background: CONF_COLOR[zone.source_confidence] ?? "#6b7280",
              }}>{zone.source_confidence}</span>
              {zone.na_order_required && (
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
                  NA order needed
                </span>
              )}
              {zone.forest_clearance_required && (
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
                  Forest clearance
                </span>
              )}
            </div>
            {zone.permitted_uses.length > 0 && (
              <div style={{ fontSize: 10.5, color: "#7B8F83", marginTop: 4, lineHeight: 1.5 }}>
                {zone.permitted_uses.join(" · ")}
              </div>
            )}
            <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 2 }}>
              {zone.zone_authority ?? "OSM/Bhuvan"} · indicative, not legal
            </div>
          </>
        ) : null}
      </div>

      {/* verdict / states ───────────────────────────────── */}
      <div style={{ marginTop: 12 }}>
        {analyzing ? (
          <div style={{ fontSize: 13, color: "#7B8F83", fontWeight: 600 }}>Assembling the verdict…</div>
        ) : error ? (
          <div style={{ background: "#F8EDE0", border: "1px solid #C4865A", borderRadius: 8, padding: 10, color: "#8a5a2a" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>⚠ Verdict unavailable — not faked</div>
            <div style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.4 }}>
              Report service (/report/go-no-go, :8010) did not respond: <code>{error}</code>. Never fabricated.
            </div>
          </div>
        ) : v ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: VERDICT_COLOR[v.verdict], letterSpacing: "0.5px" }}>
                {v.verdict.replace("_", "-")}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4, color: "#fff", background: CONF_COLOR[v.confidence] ?? "#6b7280" }}>
                {CONFIDENCE_BADGE[v.confidence]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6, lineHeight: 1.4 }}>{v.headline}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#7B8F83" }}>
              <span><b style={{ color: "#b3261e" }}>{v.red_flags.length}</b> red flag{v.red_flags.length === 1 ? "" : "s"}</span>
              <span><b style={{ color: "#b58100" }}>{v.confirm_to_upgrade.length}</b> to confirm</span>
              <span><b style={{ color: "#1a7f37" }}>{v.confirmed_clear.length}</b> clear</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#7B8F83", lineHeight: 1.4 }}>
            Selected. Press <b>Analyze this parcel</b> to run the GO / CAUTION / NO-GO verdict and the signal panels for it.
          </div>
        )}
      </div>

      {/* action ─────────────────────────────────────────── */}
      <button
        type="button" onClick={onAnalyze} disabled={analyzing}
        style={{
          marginTop: 12, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none",
          background: analyzing ? "#9CA3AF" : "#5A8F6A", color: "#fff", fontSize: 13, fontWeight: 700,
          cursor: analyzing ? "default" : "pointer",
        }}
      >
        {analyzing ? "Analyzing…" : v || error ? "Re-analyze this parcel" : "Analyze this parcel"}
      </button>

      {/* rule-5 + source caveat ─────────────────────────── */}
      <div style={{ fontSize: 9.5, color: "#7B8F83", marginTop: 8, lineHeight: 1.4 }}>
        Analysis uses KGIS <b>true geometry</b>, not the map alignment nudge. Indicative KGIS boundary — not a legal survey (3–10 m offset).
        {echawadiRecords && !echawadiRecords.loading && (
          <span> · Land records: Bhoomi e-Chawadi (Karnataka Govt), indicative.</span>
        )}
      </div>
    </div>
  );
}
