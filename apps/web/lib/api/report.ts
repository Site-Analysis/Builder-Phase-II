// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// US-092 GO / CAUTION / NO-GO verdict client. Aggregates the already-fetched LIVE signal outputs
// into a two-tier verdict via the report service. Kept in its OWN file (not analysis.ts) so the
// export/share replaces the html2canvas stub without editing the shared analysis module.

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_API_URL ?? "http://localhost:8010";

export type VerdictLevel = "GO" | "CAUTION" | "NO_GO";
export type LadderConfidence = "authoritative" | "derived" | "inferred" | "unresolved";
export type RowSection = "red_flag" | "confirmed_clear" | "confirm_to_upgrade";
export type RowSeverity = "critical" | "high" | "moderate" | "low";

export interface ReportRow {
  section: RowSection;
  label: string;
  value: string;
  citation: string | null;
  confidence: LadderConfidence;
  data_vintage: string | null;
  as_of: string | null;
  severity: RowSeverity | null;
  next_action: string | null;
  sanction_note: string;
}

export interface ReportVerdict {
  verdict: VerdictLevel;
  confidence: LadderConfidence;
  headline: string;
  confidence_note: string;
  red_flags: ReportRow[];
  confirmed_clear: ReportRow[];
  confirm_to_upgrade: ReportRow[];
  rows: ReportRow[];
  generated_at: string;
  parcel: { lat: number; lon: number; survey_number?: string | null };
  disclaimer: string;
}

export interface ReportResponse {
  report_id: string;
  verdict: ReportVerdict;
  share: { status: "ready" | "pending-supabase" | "disabled"; report_id: string; share_link: string | null; reason: string | null };
  pdf: { status: "rendered" | "unavailable" | "disabled"; media_type: string | null; byte_len: number | null; html_fallback: string | null; reason: string | null };
  data_source: string;
}

/** The already-fetched LIVE signal outputs. Each optional — an absent signal is treated as an
 *  unresolved decision input by the server (forces CAUTION), never a silent pass. */
export interface SignalBundle {
  overlays?: unknown; ownership?: unknown; far?: unknown; connectivity?: unknown;
  infra_readiness?: unknown; price?: unknown; terrain?: unknown; zone?: unknown; authority?: unknown;
}

export interface ParcelRef { lat: number; lon: number; survey_number?: string | null; village?: string | null; label?: string | null }

export async function getGoNoGo(
  parcel: ParcelRef, signals: SignalBundle,
  opts: { persist?: boolean; render_pdf?: boolean } = {},
): Promise<ReportResponse> {
  const res = await fetch(`${REPORT_URL}/report/go-no-go`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parcel, signals, persist: opts.persist ?? true, render_pdf: opts.render_pdf ?? true }),
  });
  if (!res.ok) throw new Error(`report ${res.status}: ${await res.text()}`);
  return res.json();
}

// Presentation helpers ───────────────────────────────────────────────────────
export const VERDICT_COLOR: Record<VerdictLevel, string> = {
  GO: "#1a7f37", CAUTION: "#b58100", NO_GO: "#b3261e",
};
export const CONFIDENCE_BADGE: Record<LadderConfidence, string> = {
  authoritative: "AUTHORITATIVE", derived: "DERIVED", inferred: "INFERRED", unresolved: "UNRESOLVED",
};

/** Download the report as HTML (always available) or PDF when the server rendered one. */
export function downloadReportHtml(v: ReportVerdict, htmlFallback: string | null): void {
  const html = htmlFallback ?? `<pre>${JSON.stringify(v, null, 2)}</pre>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `site-verdict-${v.verdict}-${v.parcel.lat.toFixed(4)}_${v.parcel.lon.toFixed(4)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
