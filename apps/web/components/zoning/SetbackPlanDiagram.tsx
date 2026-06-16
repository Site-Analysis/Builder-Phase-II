"use client";

import { Z } from "./theme";

interface SetbackPlanDiagramProps {
  front: number | null;
  rear: number | null;
  side: number | null;
  plotAreaSqm: number;
  width?: number;
}

// Top-down plan: outer rectangle = plot, inset rectangle = buildable footprint
// after front/rear/side setbacks. Dimensions assume a square plot for the
// schematic (sqrt of area) — indicative, not a survey.
export function SetbackPlanDiagram({ front, rear, side, plotAreaSqm, width = 150 }: SetbackPlanDiagramProps) {
  const plotSide = Math.sqrt(Math.max(plotAreaSqm, 1)); // metres
  const f = front ?? 0;
  const r = rear ?? 0;
  const s = side ?? 0;

  const pad = 26;            // label gutter
  const h = width * 0.82;
  const x0 = pad, y0 = 16;
  const w = width - pad - 10;
  const ph = h - 30;

  // metres → px
  const sx = w / plotSide;
  const sy = ph / plotSide;
  const insetTop = Math.min(f * sy, ph * 0.4);
  const insetBot = Math.min(r * sy, ph * 0.4);
  const insetSide = Math.min(s * sx, w * 0.4);

  const bx = x0 + insetSide;
  const by = y0 + insetTop;
  const bw = Math.max(w - insetSide * 2, 6);
  const bh = Math.max(ph - insetTop - insetBot, 6);

  return (
    <div>
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img"
        aria-label={`Setback plan: front ${f}m, rear ${r}m, side ${s}m`}>
        {/* plot */}
        <rect x={x0} y={y0} width={w} height={ph} fill={Z.bg} stroke={Z.border} strokeWidth={1.2} rx={2} />
        {/* buildable footprint */}
        <rect x={bx} y={by} width={bw} height={bh} fill={Z.amberTint} stroke={Z.amber} strokeWidth={1.4}
          strokeDasharray="3 2" rx={1.5} />
        <text x={bx + bw / 2} y={by + bh / 2 + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill={Z.amber}>
          BUILDABLE
        </text>
        {/* front (top) */}
        <Dim label={`${f}m`} x={x0 + w / 2} y={y0 - 5} />
        {/* rear (bottom) */}
        <Dim label={`${r}m`} x={x0 + w / 2} y={y0 + ph + 11} />
        {/* side (left, rotated) */}
        <text x={9} y={y0 + ph / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={Z.inkSoft}
          transform={`rotate(-90 9 ${y0 + ph / 2})`}>{s}m side</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: Z.inkSoft, fontWeight: 600, padding: "0 2px" }}>
        <span>Front {f}m</span><span>Rear {r}m</span><span>Side {s}m</span>
      </div>
    </div>
  );
}

function Dim({ label, x, y }: { label: string; x: number; y: number }) {
  return <text x={x} y={y} textAnchor="middle" fontSize={8} fontWeight={600} fill={Z.inkSoft}>{label}</text>;
}
