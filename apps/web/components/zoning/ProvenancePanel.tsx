"use client";

import type { ModuleResult } from "@/lib/stores/analysis";
import { buildProvenance } from "@/lib/zoning/provenance";
import { Z } from "./theme";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface ProvenancePanelProps {
  result: ModuleResult;
}

// "Sources & Confidence" — per-datum source / vintage / accuracy / tier with an
// official "verify ↗" deep-link. The honest backbone of the zoning module.
export function ProvenancePanel({ result }: ProvenancePanelProps) {
  const z = result.zoning;
  if (!z) return null;
  const { rows } = buildProvenance(z);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.key} style={{
          border: `1px solid ${Z.border}`, borderRadius: 7, padding: "7px 9px", background: Z.surfaceSolid,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: Z.ink, flex: 1 }}>{r.label}</span>
            <ConfidenceBadge tier={r.tier} />
          </div>
          <div style={{ fontSize: 9, color: Z.ink, fontWeight: 600, marginBottom: 2 }}>{r.value}</div>
          <div style={{ fontSize: 8.5, color: Z.inkSoft, lineHeight: 1.45 }}>
            {r.source} · {r.vintage}<br />
            <span style={{ color: Z.inkFaint }}>Spatial {r.spatialAccuracy} · {r.thematicAccuracy}</span>
          </div>
          <a
            href={r.verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 8.5, fontWeight: 700, color: Z.amber, textDecoration: "none", display: "inline-block", marginTop: 4 }}
          >
            Verify · {r.verifyLabel} ↗
          </a>
        </div>
      ))}
      <div style={{ fontSize: 8, color: Z.inkFaint, fontStyle: "italic", lineHeight: 1.4, marginTop: 2 }}>
        Early-stage screening — not a substitute for the official BDA RMP extract, AAI NOCAS clearance, Bhoomi RTC, or a site survey.
      </div>
    </div>
  );
}
