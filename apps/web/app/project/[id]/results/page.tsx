// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// US-092 — the Builder-feasibility RESULTS surface. The verdict IS the page: GO/CAUTION/NO-GO hero
// on top, the 12 signal panels as supporting detail below, grouped. Every builder signal is fetched
// ONCE and feeds BOTH its panel (via the existing formatter) AND the /report/go-no-go verdict bundle.
// Honest states throughout: loading -> result/unresolved/error; the verdict surfaces its own error
// (report service unreachable) rather than faking a GO.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
import { getProject } from "@/lib/api/projects";
import type { Project } from "@/lib/stores/project";
import type { ModuleId, ModuleResult } from "@/lib/stores/analysis";
import { AnalysisModuleSection } from "@/components/layout/AnalysisModuleSection";
import VerdictReport from "@/components/report/VerdictReport";
import { runBuilderSignals, LOADING_PANEL, BUILDER_SIGNAL_IDS, type ParcelInput } from "@/lib/api/verdict";
import type { ReportResponse } from "@/lib/api/report";

const GROUPS: { title: string; ids: ModuleId[] }[] = [
  { title: "Buildability", ids: ["farAssembly", "obligations"] },
  { title: "Risk",         ids: ["overlays", "terrain"] },
  { title: "Access",       ids: ["connectivitySignal", "utilities"] },
  { title: "Context",      ids: ["growth", "priceUpside"] },
  { title: "Identity",     ids: ["zoneRing"] },
];
const LABEL: Partial<Record<ModuleId, string>> = {
  farAssembly: "FAR — Permissible vs Achievable", obligations: "Mixed-Use, Parking & TIA",
  overlays: "Deal-Killer Overlays", terrain: "Terrain — Slope / Geotech",
  connectivitySignal: "Connectivity — Airport / Metro / Road", utilities: "Utilities & NOC",
  growth: "Growth Pipeline", priceUpside: "Price Upside (Indicative)", zoneRing: "Zone & Ring (RMP)",
};

export default function ResultsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const [project, setProject] = useState<Project | null | "missing">(null);
  const [panels, setPanels] = useState<Partial<Record<ModuleId, ModuleResult>>>({});
  const [verdict, setVerdict] = useState<ReportResponse | null>(null);
  const [verdictErr, setVerdictErr] = useState<string | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(true);
  const [expanded, setExpanded] = useState<Partial<Record<ModuleId, boolean>>>({ farAssembly: true, overlays: true });

  useEffect(() => { if (!user) router.replace("/login"); }, [user, router]);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      let p: Project;
      try { p = await getProject(id); } catch { if (!cancelled) setProject("missing"); return; }
      if (cancelled) return;
      setProject(p);

      // Parcel context from the stored boundary (sessionStorage hand-off from New Analysis).
      let lat = 12.9716, lon = 77.5946, polygon: [number, number][] | null = null;
      const b = p.boundary;
      if (b?.type === "Point" && Array.isArray(b.coordinates)) { lon = b.coordinates[0] as number; lat = b.coordinates[1] as number; }
      else if (b?.type === "Polygon" && Array.isArray(b.coordinates)) {
        const ring = (b.coordinates[0] as [number, number][]).map(([lo, la]) => [la, lo] as [number, number]);
        polygon = ring;
        lon = ring.reduce((s, r) => s + r[1], 0) / ring.length;
        lat = ring.reduce((s, r) => s + r[0], 0) / ring.length;
      }
      const parcel: ParcelInput = { lat, lon, polygon, area: p.area_sqm && p.area_sqm > 0 ? p.area_sqm : 1000, label: p.name };

      // Pre-set the builder panels to LOADING, then resolve them all + the verdict in ONE shared pass
      // (identical honesty logic to the map workspace — see lib/api/verdict.ts).
      const loading: Partial<Record<ModuleId, ModuleResult>> = {};
      for (const mid of BUILDER_SIGNAL_IDS) loading[mid] = LOADING_PANEL;
      if (!cancelled) setPanels(loading);

      const res = await runBuilderSignals(parcel);
      if (cancelled) return;
      setPanels(res.panels);
      setVerdict(res.verdict);
      setVerdictErr(res.verdictError);
      setVerdictLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  if (!user) return null;

  if (project === "missing") {
    return (
      <Shell>
        <div style={{ background: "#F5E4E4", border: "1px solid #C46A6A", borderRadius: 10, padding: 20, color: "#8a3a3a" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Project / parcel not found</div>
          <p style={{ fontSize: 13, marginTop: 6 }}>No stored parcel for id <code>{id}</code>. The parcel context did not carry over — start again from New Analysis.</p>
          <button onClick={() => router.push("/project/new")} style={{ marginTop: 10, padding: "8px 14px", cursor: "pointer" }}>← New Analysis</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {project && typeof project !== "string" && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#3A3F3B" }}>{project.name}</div>
          {project.location && <div style={{ fontSize: 12, color: "#7B8F83", marginTop: 2 }}>{project.location}</div>}
        </div>
      )}

      {/* ── VERDICT HERO ─────────────────────────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        {verdictLoading ? (
          <div style={{ background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#7B8F83" }}>Assembling the verdict…</div>
            <p style={{ fontSize: 13, color: "#7B8F83", marginTop: 6 }}>Aggregating {Object.keys(panels).length} live signals into the two-tier GO / CAUTION / NO-GO verdict.</p>
          </div>
        ) : verdict ? (
          <VerdictReport report={verdict} />
        ) : (
          <div style={{ background: "#F8EDE0", border: "1px solid #C4865A", borderRadius: 12, padding: 24, color: "#8a5a2a" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>⚠ Verdict unavailable — not faked</div>
            <p style={{ fontSize: 13, marginTop: 6 }}>The report service (/report/go-no-go, :8010) did not respond: <code>{verdictErr}</code>. Start the report service with <code>FLAGS=feature.report.go-no-go</code>, then reload. The verdict is NEVER fabricated — the signal panels below still show whatever resolved.</p>
          </div>
        )}
      </section>

      {/* ── SUPPORTING SIGNAL PANELS (grouped) ───────────────────── */}
      {GROUPS.map((grp) => (
        <section key={grp.title} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#7B8F83", margin: "0 0 8px" }}>{grp.title}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {grp.ids.map((mid) => {
              const r = panels[mid];
              return (
                <AnalysisModuleSection
                  key={mid}
                  moduleName={LABEL[mid] ?? mid}
                  moduleColor="#5A8F6A"
                  severity={r?.severity ?? "none"}
                  score={r?.score ?? 0}
                  confidence={r?.confidence}
                  loading={!r || r.loading}
                  error={r?.error}
                  qualitative={r?.qualitative}
                  dataSource={r?.data_source}
                  summary={r?.summary}
                  expanded={!!expanded[mid]}
                  onToggle={() => setExpanded((s) => ({ ...s, [mid]: !s[mid] }))}
                />
              );
            })}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 11, color: "#7B8F83", marginTop: 12 }}>
        Every figure is subject to authority sanction. Unresolved inputs are shown as “confirm to upgrade”, never as a pass.
        <button onClick={() => router.push(`/project/${id}`)} style={{ marginLeft: 10, fontSize: 11, color: "#5A8F6A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Open map workspace →</button>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EF", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
