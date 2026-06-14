"use client";

import { useEffect, useState } from "react";
import type { ModuleResult, SolarPoint, SolarData } from "@/lib/stores/analysis";
import { useSunStore, type SunDay } from "@/lib/stores/sun";
import { sunAt, daytime, sharedHours, hourLine, envelopePath } from "@/lib/solar";
import { reverseGeocode } from "@/lib/osm";

interface SunPanelProps {
  result?: ModuleResult;
}

const CX = 130, CY = 130, MAXR = 110;

// SAT warm→cool declination ramp (summer warm, winter cool).
const DAY_COLOR: Record<SunDay, string> = { summer: "#F59E0B", equinox: "#C4865A", winter: "#99CDD8" };
const DAY_LABEL: Record<SunDay, string> = { summer: "Jun 21", equinox: "Equinox", winter: "Dec 21" };

// Equidistant polar projection — N up, azimuth clockwise, el=90 at centre.
function project(az: number, el: number): [number, number] {
  const r = (MAXR * (90 - Math.max(0, el))) / 90;
  const a = (az * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}
function pathOf(pts: SolarPoint[]): string {
  const d = daytime(pts);
  if (d.length < 2) return "";
  return d.map((p, i) => `${i === 0 ? "M" : "L"}${project(p.az, p.el).map((n) => n.toFixed(1)).join(" ")}`).join("");
}

const COMPASS: [string, number][] = [
  ["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315],
];

export function SunPanel({ result }: SunPanelProps) {
  const { hour, day, setDay } = useSunStore();
  const solar = result?.solar as SolarData | undefined;

  // Reverse-geocode the site to a human place name (Asia/Kolkata is the IANA
  // timezone for all of India, so it can't stand in for the site location).
  const [city, setCity] = useState("");
  useEffect(() => {
    if (solar?.lat == null || solar?.lng == null) return;
    let alive = true;
    reverseGeocode(solar.lat, solar.lng).then((c) => { if (alive) setCity(c); });
    return () => { alive = false; };
  }, [solar?.lat, solar?.lng]);

  if (!solar) {
    return <div style={{ fontSize: 11, color: "#7B8F83", padding: "8px 0" }}>Solar geometry unavailable.</div>;
  }

  const order: SunDay[] = ["summer", "equinox", "winter"];
  const curves = [solar.summer, solar.equinox, solar.winter];
  const cur = sunAt(solar[day], hour);
  const curPos = cur.el > 0 ? project(cur.az, cur.el) : null;
  const latLabel = `${Math.abs(solar.lat).toFixed(2)}°${solar.lat >= 0 ? "N" : "S"}`;
  const envelope = envelopePath(solar.summer, solar.winter, project);
  const hrs = sharedHours(curves);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
      <div style={{ background: "#F2EDE8", borderRadius: 9, padding: "12px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#7B8F83" }}>
            Sun-path diagram
          </span>
          <span style={{ fontSize: 10, color: "#7B8F83", fontFamily: "var(--font-geist-mono), monospace" }} title={city || undefined}>
            {city ? `${city} · ${latLabel}` : latLabel}
          </span>
        </div>

        <svg viewBox="0 0 260 260" style={{ width: "100%", display: "block" }} aria-hidden>
          {/* Envelope band — reachable sun positions across the year */}
          {envelope && <path d={envelope} fill="#F59E0B" opacity="0.10" stroke="none" />}

          {/* Elevation rings (0–80°) */}
          {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((el) => (
            <circle key={el} cx={CX} cy={CY} r={(MAXR * (90 - el)) / 90} fill={el === 0 ? "#FBF7EF" : "none"} stroke="#CFD6C4" strokeWidth={el === 0 ? "1" : "0.6"} />
          ))}
          {/* Altitude labels along the N radius */}
          {[0, 20, 40, 60, 80].map((el) => {
            const r = (MAXR * (90 - el)) / 90;
            return (
              <text key={el} x={CX + 3} y={CY - r + 3} fontSize="7" fill="#7B8F83" fontFamily="var(--font-geist-mono), monospace">
                {el}°
              </text>
            );
          })}
          {/* Compass spokes */}
          {COMPASS.map(([, az]) => {
            const [x, y] = project(az, 0);
            return <line key={az} x1={CX} y1={CY} x2={x} y2={y} stroke="#CFD6C4" strokeWidth="0.5" />;
          })}
          {/* Compass labels */}
          {COMPASS.map(([lbl, az]) => {
            const [x, y] = project(az, -8);
            const cardinal = lbl.length === 1;
            return (
              <text key={lbl} x={x} y={y} fontSize={cardinal ? "9" : "7"} fontWeight={cardinal ? "700" : "500"}
                fill={cardinal ? "#657166" : "#B8C4BB"} textAnchor="middle" dominantBaseline="middle">{lbl}</text>
            );
          })}

          {/* Hour lines (analemma) — connect same hour across the three curves */}
          {hrs.map((h) => {
            const pts = hourLine(curves, h);
            if (pts.length < 2) return null;
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${project(p.az, p.el).map((n) => n.toFixed(1)).join(" ")}`).join("");
            return <path key={`hl-${h}`} d={d} fill="none" stroke="#3A3F3B" strokeWidth="0.6" opacity="0.35" />;
          })}

          {/* Day curves */}
          {order.map((d) => {
            const dd = pathOf(solar[d]);
            if (!dd) return null;
            const active = d === day;
            return <path key={d} d={dd} fill="none" stroke={DAY_COLOR[d]} strokeWidth={active ? 2.8 : 1.6} opacity={active ? 1 : 0.5} strokeLinecap="round" />;
          })}

          {/* Hour dots on each curve */}
          {order.map((d) =>
            daytime(solar[d]).map((p) => {
              const [x, y] = project(p.az, p.el);
              return <circle key={`${d}-${p.hour}`} cx={x} cy={y} r={d === day ? 2.4 : 1.6} fill={DAY_COLOR[d]} opacity={d === day ? 1 : 0.55} />;
            })
          )}

          {/* Hour-number labels on the summer (outer) curve */}
          {daytime(solar.summer).map((p) => {
            const [x, y] = project(p.az, p.el);
            const out = 7; // push label radially outward
            const a = (p.az * Math.PI) / 180;
            return (
              <text key={`lbl-${p.hour}`} x={x + out * Math.sin(a)} y={y - out * Math.cos(a)}
                fontSize="6.5" fill="#7B8F83" fontFamily="var(--font-geist-mono), monospace" textAnchor="middle" dominantBaseline="middle">
                {String(p.hour).padStart(2, "0")}
              </text>
            );
          })}

          {/* Current sun position */}
          {curPos && (
            <>
              <circle cx={curPos[0]} cy={curPos[1]} r="6" fill="#F59E0B" stroke="#FDFCFB" strokeWidth="2" />
              <circle cx={curPos[0]} cy={curPos[1]} r="11" fill="none" stroke="#F59E0B" strokeWidth="1" opacity="0.5" />
            </>
          )}
        </svg>

        {/* Day toggle (mirrors the map scroller) */}
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
          {order.map((d) => {
            const on = d === day;
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 7,
                  border: "1px solid", borderColor: on ? DAY_COLOR[d] : "#CFD6C4",
                  background: on ? DAY_COLOR[d] : "transparent", color: on ? "#3A2A06" : "#7B8F83",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {DAY_LABEL[d]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.5 }}>
        Concentric rings = solar altitude (0° edge → 90° centre). Shaded band spans the year between
        the {DAY_LABEL.summer} and {DAY_LABEL.winter} paths; thin lines mark equal hours. Drag the time
        slider on the map to move the sun along {DAY_LABEL[day]}; the on-map shadow updates with altitude and azimuth.
      </div>
    </div>
  );
}
