"use client";

import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, Polyline, Polygon, Marker } from "react-leaflet";
import L from "leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";
import { useSunStore } from "@/lib/stores/sun";
import { daytime, sunAt, shadowLength } from "@/lib/solar";
import { dest, shadowPolygon, type LatLng } from "@/lib/geo";
import { fetchBuildings, type Building } from "@/lib/osm";

interface SunPathArcProps {
  center: [number, number];
  result: ModuleResult;
}

const R_MAX      = 380;   // horizon circle radius (m)
const SITE_RADIUS = 200;  // building-fetch extent (m)

// Linear stereographic projection: el=0 → R_MAX, el=90 → 0
function arcRadius(el: number): number {
  return R_MAX * Math.max(0, 1 - el / 90);
}
function sunPt(center: [number, number], az: number, el: number): LatLng {
  return dest(center, az, arcRadius(el));
}

const SEASONS = [
  { key: "summer",  label: "Jun 21",  color: "#FB923C", weight: 2 },
  { key: "equinox", label: "Equinox", color: "#22C55E", weight: 1.5 },
  { key: "winter",  label: "Dec 21",  color: "#818CF8", weight: 2 },
] as const;

const COMPASS = [
  { bearing: 0,   label: "N" },
  { bearing: 45,  label: "NE" },
  { bearing: 90,  label: "E" },
  { bearing: 135, label: "SE" },
  { bearing: 180, label: "S" },
  { bearing: 225, label: "SW" },
  { bearing: 270, label: "W" },
  { bearing: 315, label: "NW" },
];

const ALT_RINGS = [15, 30, 45, 60, 75]; // degrees
const HOUR_TICKS = [6, 8, 10, 12, 14, 16, 18];
const LABEL_HOURS = [9, 12, 15];

function divLabel(text: string, color: string, size = 9): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:${size}px;font-weight:700;color:${color};
      white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,0.95);
      transform:translate(-50%,-50%)">${text}</div>`,
    iconSize: [0, 0],
  });
}

export function SunPathArc({ center, result }: SunPathArcProps) {
  const { hour, day, buildingH, shadowOpacity } = useSunStore();

  const [buildings, setBuildings] = useState<Building[]>([]);
  useEffect(() => {
    let alive = true;
    fetchBuildings(center[0], center[1], SITE_RADIUS).then((b) => { if (alive) setBuildings(b); });
    return () => { alive = false; };
  }, [center]);

  const solar = result.solar;
  if (!solar) {
    return <Circle center={center} radius={6} pathOptions={{ color: "#B45309", fillColor: "#F59E0B", fillOpacity: 1, weight: 1.5 }} />;
  }

  const pts = solar[day] ?? [];
  const sun = sunAt(pts, hour);
  const above = pts.length > 0 && sun.el > 0;
  const sunPos = sunPt(center, sun.az, sun.el);

  const shadows = useMemo<LatLng[][]>(() => {
    if (!above) return [];
    const bearing = (sun.az + 180) % 360;
    const out: LatLng[][] = [];
    for (const b of buildings) {
      const len = shadowLength(b.height ?? buildingH, sun.el);
      if (len <= 0.5) continue;
      const poly = shadowPolygon(b.ring, bearing, len);
      if (poly.length >= 3) out.push(poly);
    }
    return out;
  }, [buildings, above, sun.az, sun.el, buildingH]);

  // ── Altitude rings ────────────────────────────────────────────────────────
  const altRingData = ALT_RINGS.map((el) => ({
    el,
    radius: arcRadius(el),
    pos: dest(center, 90, arcRadius(el)) as [number, number], // label on east axis
  }));

  // ── Compass radial lines ──────────────────────────────────────────────────
  const radials = COMPASS.map(({ bearing, label }) => ({
    bearing,
    label,
    line: [center, dest(center, bearing, R_MAX)] as [LatLng, LatLng],
    labelPos: dest(center, bearing, R_MAX * 1.08) as [number, number],
  }));

  // ── Season arcs ───────────────────────────────────────────────────────────
  type SeasonKey = "summer" | "equinox" | "winter";
  const seasonArcs = SEASONS.map((s) => {
    const raw = solar[s.key as SeasonKey] ?? [];
    const day = daytime(raw);
    const line = day.map((p) => sunPt(center, p.az, p.el));
    const hourMarkers = HOUR_TICKS.flatMap((h) => {
      const p = raw[h];
      if (!p || p.el <= 0) return [];
      return [{ pos: sunPt(center, p.az, p.el) as [number, number], h }];
    });
    const labelMarkers = LABEL_HOURS.flatMap((h) => {
      const p = raw[h];
      if (!p || p.el <= 0) return [];
      return [{ pos: sunPt(center, p.az, p.el) as [number, number], h }];
    });
    // Sunrise = first daytime pt, Sunset = last
    const sunrise = day[0] ? sunPt(center, day[0].az, day[0].el) as [number, number] : null;
    const sunset  = day[day.length - 1] ? sunPt(center, day[day.length - 1].az, day[day.length - 1].el) as [number, number] : null;
    return { ...s, line, hourMarkers, labelMarkers, sunrise, sunset };
  });

  // ── Divicons (built once) ─────────────────────────────────────────────────
  const compassIcons = useMemo(
    () => COMPASS.map(({ label }) =>
      L.divIcon({
        className: "",
        html: `<div style="font-size:9px;font-weight:800;color:#4B5563;
          text-shadow:0 1px 2px rgba(255,255,255,0.9);
          transform:translate(-50%,-50%)">${label}</div>`,
        iconSize: [0, 0],
      })
    ),
    [],
  );

  const altLabelIcons = useMemo(
    () => ALT_RINGS.map((el) =>
      L.divIcon({
        className: "",
        html: `<div style="font-size:8px;color:#9CA3AF;
          text-shadow:0 1px 1px rgba(255,255,255,0.9);
          transform:translate(2px,-50%)">${el}°</div>`,
        iconSize: [0, 0],
      })
    ),
    [],
  );

  const seasonLabelIcons = useMemo(
    () => SEASONS.map((s) =>
      L.divIcon({
        className: "",
        html: `<div style="font-size:8px;font-weight:700;color:${s.color};
          text-shadow:0 1px 2px rgba(255,255,255,0.95);
          transform:translate(-50%,-120%)">${s.label}</div>`,
        iconSize: [0, 0],
      })
    ),
    [],
  );

  return (
    <>
      {/* ── Horizon + altitude rings ────────────────────────────── */}
      <Circle center={center} radius={R_MAX}
        pathOptions={{ color: "#9CA3AF", weight: 1, opacity: 0.5, fill: false }} />
      {altRingData.map(({ el, radius }, i) => (
        <Circle key={`alt-${el}`} center={center} radius={radius}
          pathOptions={{ color: "#D1D5DB", weight: 0.8, opacity: 0.55, fill: false, dashArray: "4 5" }} />
      ))}
      {/* Altitude labels on east axis */}
      {altRingData.map(({ pos }, i) => (
        <Marker key={`altlbl-${i}`} position={pos} icon={altLabelIcons[i]} interactive={false} keyboard={false} />
      ))}

      {/* ── Compass radials + labels ────────────────────────────── */}
      {radials.map(({ bearing, label, line, labelPos }, i) => (
        <Polyline key={`rad-${bearing}`} positions={line}
          pathOptions={{ color: "#D1D5DB", weight: 0.8, opacity: 0.6, dashArray: bearing % 90 === 0 ? undefined : "3 5" }} />
      ))}
      {radials.map(({ labelPos }, i) => (
        <Marker key={`clbl-${i}`} position={labelPos} icon={compassIcons[i]} interactive={false} keyboard={false} />
      ))}

      {/* ── Season arcs ─────────────────────────────────────────── */}
      {seasonArcs.map((s, si) => (
        s.line.length > 1 && (
          <Polyline key={`arc-${s.key}`} positions={s.line}
            pathOptions={{ color: s.color, weight: s.weight, opacity: 0.85 }} />
        )
      ))}

      {/* Hour tick markers */}
      {seasonArcs.flatMap((s) =>
        s.hourMarkers.map(({ pos, h }) => (
          <CircleMarker key={`tick-${s.key}-${h}`} center={pos} radius={3}
            pathOptions={{ color: "#FFFFFF", weight: 1.2, fillColor: s.color, fillOpacity: 1 }} />
        ))
      )}

      {/* Hour labels (9h, 12h, 15h) for summer only to avoid clutter */}
      {seasonArcs[0].labelMarkers.map(({ pos, h }) => (
        <Marker key={`hlbl-${h}`} position={pos}
          icon={divLabel(`${h > 12 ? h - 12 : h}${h >= 12 ? "PM" : "AM"}`, "#EA580C", 8)}
          interactive={false} keyboard={false} />
      ))}

      {/* Sunrise/Sunset dots */}
      {seasonArcs.flatMap((s) => [
        s.sunrise ? (
          <CircleMarker key={`sr-${s.key}`} center={s.sunrise} radius={5}
            pathOptions={{ color: "#FFFFFF", weight: 1.5, fillColor: s.color, fillOpacity: 1 }} />
        ) : null,
        s.sunset ? (
          <CircleMarker key={`ss-${s.key}`} center={s.sunset} radius={5}
            pathOptions={{ color: "#FFFFFF", weight: 1.5, fillColor: s.color, fillOpacity: 0.5 }} />
        ) : null,
      ])}

      {/* Season labels at arc midpoint */}
      {seasonArcs.map((s, si) => {
        const mid = s.line[Math.floor(s.line.length / 2)];
        return mid ? (
          <Marker key={`slbl-${s.key}`} position={mid as [number, number]}
            icon={seasonLabelIcons[si]} interactive={false} keyboard={false} />
        ) : null;
      })}

      {/* ── Buildings + shadows (on top of diagram) ─────────────── */}
      {shadows.map((poly, i) => (
        <Polygon key={`sh-${i}`} positions={poly}
          pathOptions={{ fillColor: "#1C2420", fillOpacity: shadowOpacity, color: "#1C2420", weight: 1, opacity: shadowOpacity * 0.7 }} />
      ))}
      {buildings.map((b, i) => (
        <Polygon key={`bf-${i}`} positions={b.ring}
          pathOptions={{ fillColor: "#657166", fillOpacity: 0.45, color: "#3A3F3B", weight: 0.6, opacity: 0.5 }} />
      ))}

      {/* ── Interactive sun position ─────────────────────────────── */}
      {above && (
        <>
          <Polyline positions={[center, sunPos]}
            pathOptions={{ color: "#F59E0B", weight: 2, opacity: 0.8, dashArray: "4 4" }} />
          <CircleMarker center={sunPos as [number, number]} radius={10}
            pathOptions={{ color: "#FDFCFB", weight: 2, fillColor: "#F59E0B", fillOpacity: 1 }} />
        </>
      )}
      {/* Site centre dot */}
      <Circle center={center} radius={6}
        pathOptions={{ color: "#B45309", weight: 1.5, fillColor: "#FEF3C7", fillOpacity: 1 }} />
    </>
  );
}
