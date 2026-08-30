// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// US-092 one-screen GO / CAUTION / NO-GO verdict view. RED-FLAGS-FIRST, then confirmed-clear, then
// the ranked "confirm to upgrade" list. Every row shows value + citation + confidence + vintage +
// the mandatory sanction note. Export (HTML/PDF) + read-only share link replace the GH#54 stub.

import {
  CONFIDENCE_BADGE,
  VERDICT_COLOR,
  downloadReportHtml,
  type ReportResponse,
  type ReportRow,
} from "@/lib/api/report";

const SECTION_TITLE: Record<ReportRow["section"], string> = {
  red_flag: "RED FLAGS — deal-killers (resolve first)",
  confirmed_clear: "Confirmed clear",
  confirm_to_upgrade: "Confirm to upgrade the verdict",
};

function RowLine({ r }: { r: ReportRow }) {
  const tone =
    r.section === "red_flag" ? "#b3261e" : r.section === "confirm_to_upgrade" ? "#b58100" : "#1a7f37";
  return (
    <div style={{ borderLeft: `3px solid ${tone}`, padding: "6px 10px", margin: "6px 0", background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>
          {r.severity ? `[${r.severity.toUpperCase()}] ` : ""}{r.label}
        </strong>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#555" }}>{CONFIDENCE_BADGE[r.confidence]}</span>
      </div>
      <div style={{ fontSize: 12, margin: "2px 0" }}>{r.value}</div>
      {r.next_action && <div style={{ fontSize: 12, color: "#8a6d00" }}>→ {r.next_action}</div>}
      <div style={{ fontSize: 10, color: "#777" }}>
        {r.citation ? `${r.citation} · ` : ""}
        {r.data_vintage ? `vintage ${r.data_vintage} · ` : ""}
        {r.as_of ? `as-of ${r.as_of} · ` : ""}
        <em>{r.sanction_note}</em>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: ReportRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 4px" }}>{title}</h3>
      {rows.map((r, i) => <RowLine key={`${r.label}-${i}`} r={r} />)}
    </section>
  );
}

export default function VerdictReport({ report }: { report: ReportResponse }) {
  const { verdict: v, share, pdf } = report;
  const colour = VERDICT_COLOR[v.verdict];
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", fontFamily: "system-ui, Arial, sans-serif", color: "#111" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: colour }}>
        {v.verdict.replace("_", "-")}
        <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
          {" "}· verdict confidence: {CONFIDENCE_BADGE[v.confidence]}
        </span>
      </div>
      <p style={{ fontSize: 15, margin: "4px 0" }}>{v.headline}</p>
      <p style={{ background: "#fff8e1", padding: 10, borderRadius: 6, fontSize: 13 }}>{v.confidence_note}</p>
      <p style={{ color: "#555", fontSize: 12 }}>
        Parcel {v.parcel.lat}, {v.parcel.lon}
        {v.parcel.survey_number ? ` · SNo ${v.parcel.survey_number}` : ""} · generated {v.generated_at}
      </p>

      <Section title={SECTION_TITLE.red_flag} rows={v.red_flags} />
      <Section title={SECTION_TITLE.confirmed_clear} rows={v.confirmed_clear} />
      <Section title={SECTION_TITLE.confirm_to_upgrade} rows={v.confirm_to_upgrade} />

      <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => downloadReportHtml(v, pdf.html_fallback)} style={{ padding: "8px 14px", cursor: "pointer" }}>
          Export report ({pdf.status === "rendered" ? "PDF ready" : "HTML"})
        </button>
        {share.status === "ready" && share.share_link ? (
          <a href={share.share_link} target="_blank" rel="noreferrer">Read-only share link</a>
        ) : (
          <span style={{ fontSize: 12, color: "#777" }}>
            Share: {share.status}{share.reason ? ` — ${share.reason}` : ""}
          </span>
        )}
      </div>
      {pdf.status === "unavailable" && (
        <p style={{ fontSize: 11, color: "#777" }}>PDF: {pdf.reason}</p>
      )}
      <p style={{ fontSize: 11, color: "#777", marginTop: 12 }}>{v.disclaimer}</p>
    </div>
  );
}
