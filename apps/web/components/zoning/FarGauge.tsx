"use client";

import { Z, arcPath, polar, clamp01 } from "./theme";

interface FarGaugeProps {
  farApplicable: number;
  baseFar: number | null;
  todApplicable: boolean;
  todFarMax: number;       // 4.0
  size?: number;
}

// 270° radial gauge: applicable FAR on a 0..4.0 scale. Base FAR shown as a tick,
// TOD ceiling shown as a ghost arc when the site qualifies.
export function FarGauge({ farApplicable, baseFar, todApplicable, todFarMax, size = 116 }: FarGaugeProps) {
  const MAX = 4.0;
  const A0 = 225;
  const SPAN = 270;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 11;

  const fApplied = clamp01(farApplicable / MAX);
  const aApplied = A0 + SPAN * fApplied;
  const aTod = A0 + SPAN * clamp01(todFarMax / MAX);
  const baseFrac = baseFar != null ? clamp01(baseFar / MAX) : null;
  const baseAngle = baseFrac != null ? A0 + SPAN * baseFrac : null;
  const [btx, bty] = baseAngle != null ? polar(cx, cy, r, baseAngle) : [0, 0];
  const [bix, biy] = baseAngle != null ? polar(cx, cy, r - 9, baseAngle) : [0, 0];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Applicable FAR ${farApplicable} of ${MAX} maximum`}>
        {/* track */}
        <path d={arcPath(cx, cy, r, A0, A0 + SPAN)} fill="none" stroke={Z.bg} strokeWidth={9} strokeLinecap="round" />
        {/* TOD ghost headroom */}
        {todApplicable && fApplied < clamp01(todFarMax / MAX) && (
          <path d={arcPath(cx, cy, r, aApplied, aTod)} fill="none" stroke={Z.good} strokeOpacity={0.32} strokeWidth={9} strokeLinecap="round" />
        )}
        {/* applied value */}
        <path d={arcPath(cx, cy, r, A0, aApplied)} fill="none" stroke={Z.amber} strokeWidth={9} strokeLinecap="round" />
        {/* base FAR tick */}
        {baseAngle != null && (
          <line x1={btx} y1={bty} x2={bix} y2={biy} stroke={Z.ink} strokeWidth={1.5} />
        )}
        {/* center readout */}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={26} fontWeight={700} fill={Z.amber}
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{farApplicable}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize={8.5} fontWeight={600} fill={Z.inkSoft}
          style={{ letterSpacing: "0.5px" }}>FAR · of {MAX}</text>
      </svg>
      <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
        {baseFar != null && (
          <Legend dotColor={Z.ink} text={`Base ${baseFar}`} />
        )}
        {todApplicable && <Legend dotColor={Z.good} text="TOD 4.0" />}
      </div>
    </div>
  );
}

function Legend({ dotColor, text }: { dotColor: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8.5, color: Z.inkSoft, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
      {text}
    </span>
  );
}
