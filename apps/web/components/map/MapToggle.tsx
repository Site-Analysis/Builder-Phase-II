"use client";

import type { ReactNode } from "react";

interface MapToggleProps {
  label: string;
  icon?: ReactNode;
  on: boolean;
  onToggle: () => void;
  count?: number;
  /** Distance from the top edge of the map, in px. Stack multiple by offset. */
  top?: number;
  /** On-state accent colour (track + icon). */
  accent?: string;
}

// Glass pill control (map sibling) — toggles an optional map layer on/off.
// Top-right placement clears the tl compliance HUD and bottom capacity HUD.
export function MapToggle({ label, icon, on, onToggle, count, top = 84, accent = "#657166" }: MapToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={on ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      style={{
        position: "absolute", top, right: 16, zIndex: 430,
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 11, cursor: "pointer", minWidth: 142,
        background: "rgba(253,252,251,0.78)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: `1px solid ${on ? "#A9BBA8" : "rgba(255,255,255,0.6)"}`,
        boxShadow: "0 6px 22px rgba(58,63,59,0.16), inset 0 1px 0 rgba(255,255,255,0.45)",
        color: on ? "#3A3F3B" : "#7B8F83",
        font: "600 12px/1 system-ui, sans-serif",
        transition: "color .12s, border-color .12s",
      }}
    >
      <span style={{ display: "inline-flex", color: on ? accent : "#9CA8A0" }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {on && count != null && count > 0 && (
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: accent,
          background: "#EAF2F1", borderRadius: 6, padding: "2px 6px",
        }}>{count}</span>
      )}
      {/* mini switch track + knob */}
      <span style={{
        width: 26, height: 15, borderRadius: 999, flexShrink: 0,
        background: on ? accent : "#CFD6C4", position: "relative", transition: "background .14s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 13 : 2, width: 11, height: 11,
          borderRadius: "50%", background: "#FDFCFB", transition: "left .14s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }} />
      </span>
    </button>
  );
}
