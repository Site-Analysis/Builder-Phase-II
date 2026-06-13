"use client";

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { ModuleChart as ModuleChartSpec } from "@/lib/stores/analysis";

const AXIS_TICK = { fontSize: 9, fill: "#64748B" };
const TOOLTIP_STYLE = {
  fontSize: 11,
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  background: "#fff",
  padding: "6px 8px",
} as const;

export function ModuleChart({ chart, height = 132 }: { chart: ModuleChartSpec; height?: number }) {
  const { title, kind, unit, series, points } = chart;
  const multi = series.length > 1;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.5px", color: "#64748B",
        }}>
          {title}
        </span>
        {unit && <span style={{ fontSize: 9, color: "#94A3B8" }}>{unit}</span>}
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" || kind === "multiLine" ? (
            <LineChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {multi && <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />}
              {series.map((s) => (
                <Line
                  key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : kind === "area" ? (
            <AreaChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {series.map((s) => (
                <Area
                  key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
              {multi && <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
