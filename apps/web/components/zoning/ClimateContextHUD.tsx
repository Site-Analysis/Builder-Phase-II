"use client";

import type { ReactNode } from "react";
import { Thermometer, Wind as WindIcon, Sun } from "lucide-react";
import type { ModuleResult } from "@/lib/stores/analysis";
import { Z, sevColor } from "./theme";

interface ClimateContextHUDProps {
  temperature?: ModuleResult;
  wind?: ModuleResult;
  sunpath?: ModuleResult;
  /** top offset below the two map toggles */
  top?: number;
}

const VERDICT: Record<string, string> = {
  high: "Demanding", moderate: "Moderate", low: "Favourable", none: "Favourable",
};

const ACCENT = { temp: "#D98B6A", wind: "#6BA9B8", sun: "#D9A23F" };

// Pull a numeric series from the first chart for the sparkline.
function series(r?: ModuleResult): number[] {
  const c = r?.charts?.[0];
  if (!c || !c.points?.length) return [];
  const key = c.series?.[0]?.key ?? "value";
  return c.points.map((p) => Number((p as Record<string, unknown>)[key])).filter((n) => Number.isFinite(n));
}

function ind(r: ModuleResult | undefined, match: string) {
  return r?.indicators?.find((i) => i.label.toLowerCase().includes(match.toLowerCase()));
}

// Vertical stack of Core-3 climate title cards, pinned to the right edge.
export function ClimateContextHUD({ temperature, wind, sunpath, top = 188 }: ClimateContextHUDProps) {
  // Headline pickers per module — value + unit + a short sub-line.
  const tMean = ind(temperature, "annual mean");
  const tPeak = ind(temperature, "peak");
  const wMean = ind(wind, "mean wind");
  const wDir = /from the ([A-Z]{1,3})\b/.exec(wind?.summary ?? "")?.[1];
  const sDec = ind(sunpath, "noon altitude (dec)");
  const sDay = ind(sunpath, "daylight hours (dec)");

  return (
    <div
      style={{
        position: "absolute", top, right: 14, zIndex: 420, width: 170,
        display: "flex", flexDirection: "column", gap: 8,
        maxHeight: "calc(100% - 210px)", overflowY: "auto", pointerEvents: "auto",
      }}
    >
      <style>{`@keyframes climIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}`}</style>
      <ClimateCard
        title="Temperature" icon={<Thermometer size={13} />} accent={ACCENT.temp}
        result={temperature}
        headline={tMean ? `${tMean.value}°C` : "—"}
        sub={tPeak ? `Peak ${tPeak.value}°C` : undefined}
      />
      <ClimateCard
        title="Wind" icon={<WindIcon size={13} />} accent={ACCENT.wind}
        result={wind}
        headline={wMean ? `${wMean.value} m/s` : "—"}
        sub={wDir ? `Prevailing ${wDir}` : undefined}
      />
      <ClimateCard
        title="Sun Path" icon={<Sun size={13} />} accent={ACCENT.sun}
        result={sunpath}
        headline={sDec ? `${sDec.value}°` : "—"}
        sub={sDay ? `${sDay.value} h Dec daylight` : "Winter noon altitude"}
      />
    </div>
  );
}

function ClimateCard({
  title, icon, accent, result, headline, sub,
}: {
  title: string; icon: ReactNode; accent: string;
  result?: ModuleResult; headline: string; sub?: string;
}) {
  const loading = !result || result.loading;
  const errored = !!result?.error;
  const spark = series(result);

  return (
    <div style={{
      background: Z.surface, borderRadius: 11, border: `1px solid ${Z.border}`,
      boxShadow: "0 5px 18px rgba(58,63,59,0.14)", overflow: "hidden",
      animation: "climIn 0.3s cubic-bezier(0.22,1,0.36,1)",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", borderBottom: `1px solid ${Z.border}` }}>
        <span style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, color: "#fff",
          background: accent, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.3px", textTransform: "uppercase", color: Z.ink }}>
          {title}
        </span>
        {!loading && !errored && result && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(result.severity), flexShrink: 0 }}
            title={VERDICT[result.severity] ?? ""} />
        )}
      </div>

      {/* body */}
      <div style={{ padding: "8px 9px" }}>
        {loading ? (
          <div style={{ fontSize: 9, color: Z.inkSoft, padding: "6px 0" }}>Loading…</div>
        ) : errored ? (
          <div style={{ fontSize: 9, color: Z.inkSoft, padding: "2px 0" }}>
            Unavailable — service offline.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: Z.ink, fontFamily: "var(--font-geist-mono), monospace" }}>
                {headline}
              </span>
              {result != null && (
                <span style={{ fontSize: 8.5, fontWeight: 700, color: sevColor(result.severity) }}>
                  {VERDICT[result.severity] ?? ""}
                </span>
              )}
            </div>
            {sub && <div style={{ fontSize: 8.5, color: Z.inkSoft, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
            {spark.length > 1 && <Sparkline values={spark} color={accent} />}
            {result?.summary && (
              <div style={{ fontSize: 8.5, color: Z.inkSoft, lineHeight: 1.35, marginTop: 5,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {result.summary}
              </div>
            )}
            {result?.data_source && (
              <div style={{ fontSize: 7.5, color: Z.inkFaint, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {result.data_source}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Tiny inline SVG sparkline (area + line), no chart dependency.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 150, h = 24, pad = 1;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: "block", marginTop: 6 }} aria-hidden>
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
