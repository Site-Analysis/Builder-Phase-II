"use client";

import { Z, arcPath, clamp01 } from "./theme";

interface BuildableDonutProps {
  plotAreaSqm: number;
  groundCoverageMax: number;   // 0..1
  buildableAreaSqm: number;    // total floor area (FAR × plot)
  size?: number;
}

// Ground-footprint donut: built footprint (coverage × plot) vs open ground.
// Centre reads the total buildable floor area across all storeys.
export function BuildableDonut({ plotAreaSqm, groundCoverageMax, buildableAreaSqm, size = 116 }: BuildableDonutProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const builtFrac = clamp01(groundCoverageMax);
  const sweep = 360 * builtFrac;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Ground coverage ${Math.round(builtFrac * 100)} percent`}>
        {/* open ground track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={Z.goodBg} strokeWidth={11} />
        {/* built footprint */}
        {sweep > 0.5 && (
          <path d={arcPath(cx, cy, r, 0, Math.min(sweep, 359.9))} fill="none" stroke={Z.amber} strokeWidth={11}
            strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={17} fontWeight={700} fill={Z.ink}
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
          {Math.round(buildableAreaSqm).toLocaleString()}
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8} fontWeight={600} fill={Z.inkSoft}>sqm buildable</text>
        <text x={cx} y={cy + 21} textAnchor="middle" fontSize={7.5} fill={Z.inkFaint}>
          {Math.round(builtFrac * 100)}% footprint
        </text>
      </svg>
      <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
        <Legend dotColor={Z.amber} text="Built footprint" />
        <Legend dotColor={Z.goodBg} text="Open ground" border />
      </div>
    </div>
  );
}

function Legend({ dotColor, text, border }: { dotColor: string; text: string; border?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8, color: Z.inkSoft, fontWeight: 600 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: dotColor, display: "inline-block", border: border ? `1px solid ${Z.border}` : "none" }} />
      {text}
    </span>
  );
}
