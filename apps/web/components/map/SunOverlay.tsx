"use client";

import { useEffect } from "react";
import type { ModuleResult } from "@/lib/stores/analysis";
import { useSunStore, type SunDay } from "@/lib/stores/sun";
import { sunAt, dayRange, shadowLength, fmtHour } from "@/lib/solar";

interface SunOverlayProps {
  result: ModuleResult;
}

const DAYS: { id: SunDay; label: string }[] = [
  { id: "summer",  label: "Jun 21" },
  { id: "equinox", label: "Equinox" },
  { id: "winter",  label: "Dec 21" },
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(az: number) { return COMPASS[Math.round(az / 45) % 8]; }

export function SunOverlay({ result }: SunOverlayProps) {
  const { hour, day, buildingH, shadowOpacity, setHour, setDay, setBuildingH, setShadowOpacity } = useSunStore();
  const pts = result.solar?.[day] ?? [];
  const { start, end } = dayRange(pts);

  // Keep the hour inside the selected day's daylight window
  useEffect(() => {
    if (hour < start) setHour(start);
    else if (hour > end) setHour(end);
  }, [day, start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const sun = sunAt(pts, hour);
  const above = sun.el > 0;
  const shadow = above ? shadowLength(buildingH, sun.el) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}>

      {/* ── Sun readout — top-left ───────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 9, padding: "9px 13px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)", minWidth: 140,
      }}>
        <div style={{ fontSize: 9, color: "#7B8F83", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>
          Sun Position
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: "#B45309", fontFamily: "var(--font-geist-mono), monospace" }}>
          {fmtHour(hour)}
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 3, fontWeight: 500 }}>
          {above
            ? `Alt ${sun.el.toFixed(0)}° · Az ${sun.az.toFixed(0)}° ${compass(sun.az)}`
            : "Below horizon"}
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 1, fontWeight: 500 }}>
          {above && shadow > 0 ? `Shadow ${shadow.toFixed(0)} m (${buildingH} m bldg)` : "No shadow"}
        </div>
        {above && sun.el > 65 && (
          <div style={{ fontSize: 9, color: "#B45309", marginTop: 2, fontWeight: 500 }}>
            Near-overhead — shadows short
          </div>
        )}
      </div>

      {/* ── Day toggle + time scroller — bottom-center ───────────────────── */}
      <div style={{
        position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
        width: "min(440px, calc(100% - 80px))", pointerEvents: "auto",
        background: "rgba(253,252,251,0.55)",
        backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.6)", borderRadius: 14,
        boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
        padding: "10px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {DAYS.map((d) => {
              const on = day === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDay(d.id)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7,
                    border: "1px solid", borderColor: on ? "#F59E0B" : "rgba(207,214,196,0.7)",
                    background: on ? "#F59E0B" : "rgba(253,252,251,0.5)",
                    color: on ? "#3A2A06" : "#7B8F83", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", fontFamily: "var(--font-geist-mono), monospace" }}>
            {fmtHour(hour)}
          </span>
        </div>
        <input
          type="range"
          min={start} max={end} step={0.25} value={Math.min(Math.max(hour, start), end)}
          onChange={(e) => setHour(parseFloat(e.target.value))}
          aria-label="Time of day"
          style={{ width: "100%", accentColor: "#F59E0B", cursor: "pointer" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7B8F83", marginTop: 2 }}>
          <span>{fmtHour(start)} sunrise</span>
          <span>drag to move sun · shadow updates live</span>
          <span>{fmtHour(end)} sunset</span>
        </div>

        {/* Shadow opacity slider */}
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(207,214,196,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#7B8F83", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Shadow opacity
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3A3F3B", fontFamily: "var(--font-geist-mono), monospace" }}>
              {Math.round(shadowOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0} max={1} step={0.05} value={shadowOpacity}
            onChange={(e) => setShadowOpacity(parseFloat(e.target.value))}
            aria-label="Shadow opacity"
            style={{ width: "100%", accentColor: "#3A3F3B", cursor: "pointer" }}
          />
        </div>

        {/* Building-height control — drives the cast-shadow length */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(207,214,196,0.6)",
        }}>
          <span
            title="Used for buildings with no height in OpenStreetMap"
            style={{ fontSize: 10, fontWeight: 600, color: "#7B8F83", textTransform: "uppercase", letterSpacing: "0.4px" }}
          >
            Assumed height
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setBuildingH(buildingH - 1)}
              aria-label="Decrease building height"
              style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(207,214,196,0.8)", background: "rgba(253,252,251,0.7)", color: "#657166", cursor: "pointer", fontSize: 14, lineHeight: 1, fontFamily: "inherit" }}
            >−</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", minWidth: 42, textAlign: "center", fontFamily: "var(--font-geist-mono), monospace" }}>
              {buildingH} m
            </span>
            <button
              onClick={() => setBuildingH(buildingH + 1)}
              aria-label="Increase building height"
              style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(207,214,196,0.8)", background: "rgba(253,252,251,0.7)", color: "#657166", cursor: "pointer", fontSize: 14, lineHeight: 1, fontFamily: "inherit" }}
            >+</button>
          </div>
        </div>
      </div>
    </div>
  );
}
