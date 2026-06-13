import type { QualitativeStat, QualitativeTone } from "@/lib/stores/analysis";

const TONE: Record<QualitativeTone, { bg: string; fg: string; dot: string }> = {
  good:    { bg: "#F0FDF4", fg: "#15803D", dot: "#16A34A" },
  warn:    { bg: "#FFFBEB", fg: "#B45309", dot: "#D97706" },
  bad:     { bg: "#FEF2F2", fg: "#B91C1C", dot: "#DC2626" },
  neutral: { bg: "#F1F5F9", fg: "#475569", dot: "#94A3B8" },
};

export function QualitativeChips({ stats }: { stats: QualitativeStat[] }) {
  if (!stats?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {stats.map((s) => {
        const t = TONE[s.tone ?? "neutral"];
        return (
          <span
            key={s.label}
            title={s.label}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 9px", borderRadius: 7, background: t.bg,
              fontSize: 11, fontWeight: 500, color: t.fg,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
            <span style={{ color: "#64748B", fontWeight: 400 }}>{s.label}:</span>
            <span style={{ fontWeight: 600 }}>{s.value}</span>
          </span>
        );
      })}
    </div>
  );
}
