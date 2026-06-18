"use client";

import type { CSSProperties } from "react";

interface MapCompassProps {
  bearing: number;              // map bearing in degrees (0 = north up, clockwise +)
  onResetNorth?: () => void;    // click → snap map back to north
  style?: CSSProperties;        // positioning override
}

// Cardinal-ring compass. The inner ring counter-rotates to `-bearing` so the N
// letter always points to true map-north on screen. Click resets the map north.
const SIZE = 64;
const C = SIZE / 2;            // centre
const R = 23;                  // letter radius from centre

// Cardinal letters at their bearing (0=N, clockwise). Position computed on the
// ring; the whole group rotates, so letters stay upright-ish via counter text.
const CARDINALS = [
  { label: "N", bearing: 0,   color: "#F4A259", weight: 800 },
  { label: "E", bearing: 90,  color: "#3A3F3B", weight: 700 },
  { label: "S", bearing: 180, color: "#7B8F83", weight: 700 },
  { label: "W", bearing: 270, color: "#3A3F3B", weight: 700 },
];

export function MapCompass({ bearing, onResetNorth, style }: MapCompassProps) {
  return (
    <button
      type="button"
      onClick={onResetNorth}
      title="Reset north"
      aria-label={`Compass — map bearing ${Math.round(((bearing % 360) + 360) % 360)}°. Click to reset north.`}
      style={{
        position: "absolute", top: 58, right: 14, zIndex: 500,
        width: SIZE, height: SIZE, padding: 0,
        borderRadius: "50%", cursor: "pointer",
        border: "1px solid rgba(207,214,196,0.8)",
        background: "rgba(253,252,251,0.92)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        ...style,
      }}
    >
      <svg
        width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 0.2s ease-out" }}
      >
        {/* North tick — short accent wedge pointing at the N letter */}
        <polygon
          points={`${C},${C - R - 6} ${C - 4.5},${C - R + 4} ${C + 4.5},${C - R + 4}`}
          fill="#F4A259"
        />
        {/* Cardinal letters around the rim */}
        {CARDINALS.map(({ label, bearing: b, color, weight }) => {
          const rad = ((b - 90) * Math.PI) / 180; // 0° = up
          const x = C + R * Math.cos(rad);
          const y = C + R * Math.sin(rad);
          return (
            <text
              key={label}
              x={x} y={y}
              fontSize={label === "N" ? 15 : 12}
              fontWeight={weight}
              fill={color}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="inherit"
            >
              {label}
            </text>
          );
        })}
        {/* Centre dot */}
        <circle cx={C} cy={C} r={2.5} fill="#3A3F3B" />
      </svg>
    </button>
  );
}
