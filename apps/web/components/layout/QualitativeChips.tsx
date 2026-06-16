"use client";

import { useState } from "react";
import type { QualitativeStat, QualitativeTone } from "@/lib/stores/analysis";

const TONE: Record<QualitativeTone, { bg: string; fg: string; dot: string; border: string }> = {
  good:    { bg: "#E4F0E8", fg: "#5A8F6A", dot: "#5A8F6A", border: "#5A8F6A" },
  warn:    { bg: "#F8EDE0", fg: "#C4865A", dot: "#C4865A", border: "#C4865A" },
  bad:     { bg: "#F5E4E4", fg: "#C46A6A", dot: "#C46A6A", border: "#C46A6A" },
  neutral: { bg: "#F2EDE8", fg: "#7B8F83", dot: "#B8C4BB", border: "#CFD6C4" },
};

const ICON: Record<QualitativeTone, string> = {
  good:    "✓",
  warn:    "⚠",
  bad:     "✕",
  neutral: "·",
};

const ALERT_THRESHOLD = 60;

function isAlert(s: QualitativeStat): boolean {
  return s.tone === "bad" || (s.tone === "warn" && (s.value?.length ?? 0) > ALERT_THRESHOLD);
}

function AlertCard({ s }: { s: QualitativeStat }) {
  const [expanded, setExpanded] = useState(false);
  const t = TONE[s.tone ?? "neutral"];
  const long = (s.value?.length ?? 0) > 100;
  const displayValue = long && !expanded ? s.value.slice(0, 96) + "…" : s.value;

  return (
    <div style={{
      background: t.bg,
      borderLeft: `3px solid ${t.border}`,
      borderRadius: "0 8px 8px 0",
      padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{
          flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
          background: t.dot, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, marginTop: 1,
        }}>
          {ICON[s.tone ?? "neutral"]}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.fg, marginBottom: 3, letterSpacing: "0.2px" }}>
            {s.label}
          </div>
          <div style={{ fontSize: 11, color: "#3A3F3B", lineHeight: 1.55 }}>
            {displayValue}
            {long && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  marginLeft: 4, fontSize: 10, color: t.fg, fontWeight: 600,
                  border: "none", background: "none", cursor: "pointer", padding: 0,
                  textDecoration: "underline", textUnderlineOffset: 2,
                }}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QualitativeChips({ stats }: { stats: QualitativeStat[] }) {
  if (!stats?.length) return null;

  const alerts = stats.filter(isAlert);
  const chips  = stats.filter((s) => !isAlert(s));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {alerts.map((s) => <AlertCard key={s.label} s={s} />)}

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: alerts.length > 0 ? 2 : 0 }}>
          {chips.map((s) => {
            const t = TONE[s.tone ?? "neutral"];
            return (
              <span
                key={s.label}
                title={s.value}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 9px", borderRadius: 7, background: t.bg,
                  fontSize: 11, fontWeight: 500, color: t.fg,
                  maxWidth: "100%",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
                <span style={{ color: "#7B8F83", fontWeight: 400, flexShrink: 0 }}>{s.label}:</span>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {s.value}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
