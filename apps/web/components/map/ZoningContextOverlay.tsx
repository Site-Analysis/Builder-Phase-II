"use client";

import { Circle, CircleMarker, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";

interface ZoningContextOverlayProps {
  center: [number, number];
  zoningResult: ModuleResult;
  amenitiesResult?: ModuleResult;
  showAmenities?: boolean;
}

// Amenity category → marker colour.
// Light, earthy palette — soft pastels matching the sage/clay UI while keeping
// each category's hue identity distinct.
const CAT_COLOR: Record<string, string> = {
  Healthcare: "#CE9090",
  Education: "#93AFCC",
  Retail: "#D2A77F",
  Finance: "#93B7A0",
  Recreation: "#95BC9C",
  Religious: "#AEA1CC",
  Transport: "#88B0C2",
};
// Amenity category → glyph for the anchor pin (nearest of each category).
const CAT_GLYPH: Record<string, string> = {
  Healthcare: "🏥",
  Education: "🎓",
  Retail: "🛒",
  Finance: "🏦",
  Recreation: "🌳",
  Religious: "⛪",
  Transport: "🚌",
};
const AMBER = "#B45309";
const METRO = "#7C3AED";

function pinIcon(glyph: string, bg: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${bg};color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);border:1.5px solid #fff;">${glyph}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const AIRPORT_ICON = pinIcon("✈", AMBER);
const METRO_ICON = pinIcon("Ⓜ", METRO);

// One coloured glyph pin per category, built once.
const CAT_ICON: Record<string, L.DivIcon> = Object.fromEntries(
  Object.entries(CAT_GLYPH).map(([cat, g]) => [cat, pinIcon(g, CAT_COLOR[cat] ?? "#95BC9C")]),
);
function catPin(cat: string): L.DivIcon {
  return CAT_ICON[cat] ?? pinIcon("•", "#95BC9C");
}

export function ZoningContextOverlay({ center, zoningResult, amenitiesResult, showAmenities = false }: ZoningContextOverlayProps) {
  const z = zoningResult.zoning;
  if (!z) return null;

  const amenities = showAmenities
    ? (amenitiesResult?.amenityPoints ?? []).filter((a) => a.lat != null && a.lon != null)
    : [];
  // Nearest amenity per category → glyph anchor pin; the rest → colour dots.
  const anchorIdx = new Map<string, number>();
  amenities.forEach((a, i) => {
    const cur = anchorIdx.get(a.category);
    if (cur === undefined || a.distanceM < amenities[cur].distanceM) anchorIdx.set(a.category, i);
  });
  const anchors = new Set(anchorIdx.values());
  const features = z.context.filter(
    (c) => c.category !== "airport" && c.category !== "metro" && c.lat != null && c.lon != null,
  );
  const airport = z.airportLat != null && z.airportLon != null ? ([z.airportLat, z.airportLon] as [number, number]) : null;
  const metro = z.metroLat != null && z.metroLon != null ? ([z.metroLat, z.metroLon] as [number, number]) : null;

  return (
    <>
      {/* 500m TOD ring around the metro — green when the site qualifies */}
      {metro && (
        <Circle
          center={metro}
          radius={500}
          pathOptions={{
            color: z.todApplicable ? "#16A34A" : "#9CA3AF",
            weight: 1.5,
            dashArray: "5 5",
            fillColor: z.todApplicable ? "#16A34A" : "#9CA3AF",
            fillOpacity: z.todApplicable ? 0.08 : 0.04,
          }}
        />
      )}

      {/* Site → airport waypoint (dashed amber) */}
      {airport && (
        <Polyline
          positions={[center, airport]}
          pathOptions={{ color: AMBER, weight: 2, dashArray: "6 5", opacity: 0.75 }}
        >
          <Tooltip sticky>{`${z.airportName} · ${z.airportDistanceKm.toFixed(1)} km${z.dgcaNocRequired ? " · DGCA NOC required" : ""}`}</Tooltip>
        </Polyline>
      )}

      {/* Nearby OSM land features (≤500m) — small neutral dots */}
      {features.map((f, i) => (
        <CircleMarker
          key={`f-${i}`}
          center={[f.lat as number, f.lon as number]}
          radius={4}
          pathOptions={{ color: "#fff", weight: 1, fillColor: "#94A3B8", fillOpacity: 0.9 }}
        >
          <Tooltip direction="top" offset={[0, -4]}>{`${f.category}: ${f.label} · ${Math.round(f.distanceM)} m`}</Tooltip>
        </CircleMarker>
      ))}

      {/* Amenities — colour dots, with a glyph anchor pin for the nearest of each category */}
      {amenities.map((a, i) =>
        anchors.has(i) ? (
          <Marker key={`a-${i}`} position={[a.lat, a.lon]} icon={catPin(a.category)}>
            <Tooltip direction="top" offset={[0, -11]}>{`${a.category}: ${a.name} · ${Math.round(a.distanceM)} m`}</Tooltip>
          </Marker>
        ) : (
          <CircleMarker
            key={`a-${i}`}
            center={[a.lat, a.lon]}
            radius={5}
            pathOptions={{ color: "#fff", weight: 1.2, fillColor: CAT_COLOR[a.category] ?? "#95BC9C", fillOpacity: 0.92 }}
          >
            <Tooltip direction="top" offset={[0, -5]}>{`${a.category}: ${a.name} · ${Math.round(a.distanceM)} m`}</Tooltip>
          </CircleMarker>
        ),
      )}

      {/* Metro station marker */}
      {metro && (
        <Marker position={metro} icon={METRO_ICON}>
          <Tooltip direction="top" offset={[0, -10]}>{`${z.metroName ?? "Metro"} · ${Math.round(z.metroDistanceM ?? 0)} m${z.todApplicable ? " · TOD FAR 4.0" : ""}`}</Tooltip>
        </Marker>
      )}

      {/* Airport marker at the far end of the waypoint */}
      {airport && (
        <Marker position={airport} icon={AIRPORT_ICON}>
          <Tooltip direction="top" offset={[0, -10]}>{`${z.airportName} · ${z.airportDistanceKm.toFixed(1)} km · ${z.airportSurface}`}</Tooltip>
        </Marker>
      )}
    </>
  );
}
