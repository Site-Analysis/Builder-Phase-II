"use client";

import { useState } from "react";
import type { ModuleResult } from "@/lib/stores/analysis";
import { Z } from "./theme";
import { HudCard, ZoneChip, type HudCorner } from "./HudCard";
import { ComplianceMatrix } from "./ComplianceMatrix";
import { ProvenancePanel } from "./ProvenancePanel";
import { buildProvenance } from "@/lib/zoning/provenance";

interface ZoningComplianceHUDProps {
  result: ModuleResult;
  variant?: "compact" | "full";
  corner?: HudCorner;
}

// Top-left HUD: zone classification + compliance traffic-lights + provenance.
export function ZoningComplianceHUD({ result, variant = "full", corner = "tl" }: ZoningComplianceHUDProps) {
  const [showSources, setShowSources] = useState(false);
  const z = result.zoning;
  if (!z) return null;
  const full = variant === "full";

  const { dataConfidence } = buildProvenance(z);
  const confColor = dataConfidence >= 70 ? Z.good : dataConfidence >= 50 ? Z.warn : Z.bad;
  const blockers = [z.naRequired, z.forestRequired, z.dgcaNocRequired].filter(Boolean).length;
  const humanLanduse = z.primaryLanduse
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <HudCard
      title="Zoning Compliance"
      subtitle={z.zoneCode ? `Zone code ${z.zoneCode}` : `Primary use · ${humanLanduse}`}
      score={z.score}
      severity={z.severity}
      corner={corner}
      width={full ? 248 : 226}
      maxHeight={full ? "calc(50% - 20px)" : undefined}
      footer={full ? `LULC ${z.lulcClass ?? "n/a"}${z.lulcVintage ? ` · ISRO NRSC ${z.lulcVintage}` : ""} · ${z.sourceConfidence === "authoritative" ? "Authoritative" : "Community"} source` : undefined}
    >
      {/* zone + blocker line */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
        <ZoneChip label={z.zoneClass} />
        {z.todApplicable && <ZoneChip label="TOD FAR 4.0" tone={Z.good} bg={Z.goodBg} />}
        {blockers > 0 && <ZoneChip label={`${blockers} blocker${blockers > 1 ? "s" : ""}`} tone={Z.bad} bg={Z.badBg} />}
      </div>

      {/* KGIS authoritative location (flag-gated) */}
      {z.kgis && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 9, fontSize: 9, color: Z.inkSoft }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: Z.good, flexShrink: 0 }} />
          <span style={{ fontWeight: 800, color: Z.good }}>KGIS</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {z.kgis.type === "Rural"
              ? `${z.kgis.village ?? "—"}, ${z.kgis.taluk ?? "—"}${z.kgis.surveyNumber ? ` · Survey ${z.kgis.surveyNumber}` : ""}`
              : `${z.kgis.ward ?? "—"} · BBMP ${z.kgis.adminZone ?? "—"}`}
          </span>
        </div>
      )}

      {/* Data-Confidence — distinct from the suitability score */}
      <div style={{ marginBottom: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: Z.inkSoft, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Data confidence
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: confColor, fontFamily: "var(--font-geist-mono), monospace" }}>
            {dataConfidence}<span style={{ fontSize: 8, color: Z.inkFaint, fontWeight: 400 }}>/100</span>
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: Z.bg, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${dataConfidence}%`, background: confColor, borderRadius: 2 }} />
        </div>
      </div>

      <ComplianceMatrix zoning={z} limit={full ? undefined : 3} />

      {/* permitted uses — full only */}
      {full && z.permittedUses.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: Z.inkSoft, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>
            Permitted uses
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {z.permittedUses.slice(0, 8).map((u) => (
              <span key={u} style={{
                fontSize: 8.5, color: Z.ink, background: Z.bg, borderRadius: 4, padding: "2px 6px", fontWeight: 600,
              }}>{u}</span>
            ))}
          </div>
        </div>
      )}

      {/* Sources & verification — collapsible (full only) */}
      {full && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${Z.border}`, paddingTop: 8 }}>
          <button
            onClick={() => setShowSources((s) => !s)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontSize: 8.5, fontWeight: 700, color: Z.inkSoft, textTransform: "uppercase", letterSpacing: "0.4px",
            }}
          >
            Sources &amp; confidence
            <span style={{ fontSize: 9, color: Z.amber }}>{showSources ? "Hide ▲" : "Verify ▾"}</span>
          </button>
          {showSources && (
            <div style={{ marginTop: 7 }}>
              <ProvenancePanel result={result} />
            </div>
          )}
        </div>
      )}
    </HudCard>
  );
}
