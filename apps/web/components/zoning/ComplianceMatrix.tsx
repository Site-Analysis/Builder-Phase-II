"use client";

import type { ZoningData } from "@/lib/stores/analysis";
import { Z, STATUS_COLOR, STATUS_BG, type Status } from "./theme";

interface ComplianceMatrixProps {
  zoning: ZoningData;
  limit?: number;          // show only the N highest-severity rows (compact mode)
}

interface Row { label: string; value: string; status: Status }

const RANK: Record<Status, number> = { blocked: 0, caution: 1, info: 2, pass: 3 };

function buildRows(z: ZoningData): Row[] {
  const vintageYear = z.lulcVintage ? parseInt(z.lulcVintage.split("-")[0], 10) : null;
  const vintageAge = vintageYear ? new Date().getFullYear() - vintageYear : null;

  return [
    { label: "NA Order", status: z.naRequired ? "blocked" : "pass",
      value: z.naRequired ? "Required — DC/BDA" : "Not indicated" },
    { label: "Forest Clearance", status: z.forestRequired ? "blocked" : "pass",
      value: z.forestRequired ? "Required — MoEFCC" : "Not indicated" },
    { label: "DGCA NOC", status: z.dgcaNocRequired ? "blocked" : "pass",
      value: z.dgcaNocRequired ? `Required — ${z.airportName}` : "Not required" },
    { label: "Road Width", status: z.roadWidthSource === "default_9m" ? "caution" : "pass",
      value: z.roadWidthSource === "default_9m" ? "Estimated 9m (OSM gap)" : `${z.roadWidthM.toFixed(1)}m confirmed` },
    { label: "LULC Vintage", status: z.lulcVintage == null ? "info" : (vintageAge != null && vintageAge > 2 ? "caution" : "pass"),
      value: z.lulcVintage ? `${z.lulcVintage}${vintageAge != null && vintageAge > 2 ? ` · ${vintageAge}y old` : ""}` : "Unavailable" },
    { label: "Source", status: z.sourceConfidence === "authoritative" ? "pass" : "caution",
      value: z.sourceConfidence === "authoritative" ? "ISRO NRSC + OSM" : "OSM community only" },
  ];
}

export function ComplianceMatrix({ zoning, limit }: ComplianceMatrixProps) {
  let rows = buildRows(zoning);
  if (limit != null) {
    rows = [...rows].sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, limit);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r) => (
        <div key={r.label} style={{
          display: "flex", alignItems: "center", gap: 7,
          background: STATUS_BG[r.status], borderRadius: 5, padding: "4px 7px",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[r.status], flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: Z.ink, width: 78, flexShrink: 0 }}>{r.label}</span>
          <span style={{ fontSize: 9, color: Z.inkSoft, fontWeight: 500, lineHeight: 1.2 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
