"use client";

import type { ModuleResult } from "@/lib/stores/analysis";

interface ZoningMapLegendProps {
  zoningResult: ModuleResult;
  amenitiesResult?: ModuleResult;
  showAmenities?: boolean;
}

// Keep in sync with ZoningContextOverlay — light, earthy category palette.
const CAT_COLOR: Record<string, string> = {
  Healthcare: "#CE9090",
  Education: "#93AFCC",
  Retail: "#D2A77F",
  Finance: "#93B7A0",
  Recreation: "#95BC9C",
  Religious: "#AEA1CC",
  Transport: "#88B0C2",
};

// Compact horizontal legend for the zoning map overlay (bottom-centre).
export function ZoningMapLegend({ zoningResult, amenitiesResult, showAmenities = false }: ZoningMapLegendProps) {
  const z = zoningResult.zoning;
  if (!z) return null;

  // only show amenity categories that actually have pins, and only when the
  // amenities layer is toggled on
  const present = new Set((amenitiesResult?.amenityPoints ?? []).map((a) => a.category));
  const catItems = showAmenities ? Object.entries(CAT_COLOR).filter(([c]) => present.has(c)) : [];

  return (
    <div
      style={{
        // sit above the DrawTools card (bottom:16, ~48px tall) to avoid overlap
        position: "absolute", bottom: 76, left: "50%", transform: "translateX(-50%)",
        zIndex: 420, pointerEvents: "none",
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 12px",
        maxWidth: "62%",
        background: "rgba(253,252,251,0.94)", border: "1px solid #CFD6C4", borderRadius: 9,
        padding: "7px 12px", boxShadow: "0 3px 14px rgba(58,63,59,0.12)",
      }}
    >
      {catItems.map(([cat, color]) => (
        <Item key={cat} color={color} label={cat} />
      ))}
      {z.metroLat != null && (
        <Item color="#7C3AED" label={z.todApplicable ? "Metro · 500m TOD" : "Metro"} ring />
      )}
      {z.airportLat != null && <Item color="#B45309" label="Airport (dashed)" line />}
      <Item color="#94A3B8" label="Nearby feature" />
    </div>
  );
}

function Item({ color, label, ring, line }: { color: string; label: string; ring?: boolean; line?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, color: "#3A3F3B", fontWeight: 600 }}>
      {line ? (
        <span style={{ width: 14, height: 0, borderTop: `2px dashed ${color}`, display: "inline-block" }} />
      ) : (
        <span style={{
          width: 10, height: 10, borderRadius: "50%", background: ring ? "transparent" : color,
          border: ring ? `2px dashed ${color}` : `1.5px solid #fff`, boxShadow: ring ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
          display: "inline-block", flexShrink: 0,
        }} />
      )}
      {label}
    </span>
  );
}
