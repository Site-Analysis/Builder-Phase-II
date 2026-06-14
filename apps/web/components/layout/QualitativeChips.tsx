import type { QualitativeStat, QualitativeTone } from "@/lib/stores/analysis";

const TONE: Record<QualitativeTone, { bg: string; fg: string; dot: string }> = {
  good:    { bg: "#E4F0E8", fg: "#5A8F6A", dot: "#5A8F6A" },
  warn:    { bg: "#F8EDE0", fg: "#C4865A", dot: "#C4865A" },
  bad:     { bg: "#F5E4E4", fg: "#C46A6A", dot: "#C46A6A" },
  neutral: { bg: "#F2EDE8", fg: "#7B8F83", dot: "#B8C4BB" },
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
            <span style={{ color: "#7B8F83", fontWeight: 400 }}>{s.label}:</span>
            <span style={{ fontWeight: 600 }}>{s.value}</span>
          </span>
        );
      })}
    </div>
  );
}
