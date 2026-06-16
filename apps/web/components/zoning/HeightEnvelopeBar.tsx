"use client";

import { Z, clamp } from "./theme";

interface HeightEnvelopeBarProps {
  maxHeightM: number;
  heightLimitingFactor: string;
  olsHeightM: number | null;   // airport OLS limit, if restrictive
  height?: number;
}

// Vertical building envelope. Fills to the permissible max height on a 0..scale
// axis. Draws the ICAO OLS limit line in red when an airport surface restricts
// height below the regulatory max.
export function HeightEnvelopeBar({ maxHeightM, heightLimitingFactor, olsHeightM, height = 132 }: HeightEnvelopeBarProps) {
  const ceiling = Math.max(70, maxHeightM, olsHeightM ?? 0);
  const scaleTop = Math.ceil(ceiling / 10) * 10;
  const barW = 30;
  const x = 38;
  const topPad = 10;
  const usable = height - topPad - 18;
  const yFor = (m: number) => topPad + usable * (1 - clamp(m / scaleTop, 0, 1));

  const fillTop = yFor(maxHeightM);
  const olsRestrictive = olsHeightM != null && olsHeightM < maxHeightM;

  const ticks = [0, scaleTop / 2, scaleTop];

  return (
    <div>
      <svg width={120} height={height} viewBox={`0 0 120 ${height}`} role="img"
        aria-label={`Max height ${maxHeightM} metres, limited by ${heightLimitingFactor}`}>
        {/* axis ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x - 4} y1={yFor(t)} x2={x} y2={yFor(t)} stroke={Z.border} strokeWidth={1} />
            <text x={x - 6} y={yFor(t) + 3} textAnchor="end" fontSize={7.5} fill={Z.inkFaint}>{t}</text>
          </g>
        ))}
        {/* ground */}
        <line x1={x} y1={yFor(0)} x2={x + barW + 8} y2={yFor(0)} stroke={Z.ink} strokeWidth={1.4} />
        {/* envelope fill */}
        <rect x={x} y={fillTop} width={barW} height={yFor(0) - fillTop} fill={Z.amberTint} stroke={Z.amber}
          strokeWidth={1.3} rx={1.5} />
        <text x={x + barW / 2} y={fillTop - 3} textAnchor="middle" fontSize={11} fontWeight={700} fill={Z.amber}
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{maxHeightM}m</text>
        {/* OLS limit line */}
        {olsRestrictive && (
          <g>
            <line x1={x - 2} y1={yFor(olsHeightM!)} x2={x + barW + 30} y2={yFor(olsHeightM!)} stroke={Z.bad}
              strokeWidth={1.3} strokeDasharray="3 2" />
            <text x={x + barW + 10} y={yFor(olsHeightM!) - 3} fontSize={7.5} fontWeight={700} fill={Z.bad}>
              OLS {olsHeightM}m
            </text>
          </g>
        )}
      </svg>
      <div style={{ fontSize: 8, color: Z.inkSoft, fontWeight: 600, textAlign: "center", marginTop: -2 }}>
        Limited by {heightLimitingFactor}
      </div>
    </div>
  );
}
