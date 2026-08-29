// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

// Builder site feasibility report — self-contained HTML generator.
// No external deps at runtime: Leaflet is loaded from CDN inside the map iframe.
// All data comes from the results page state: project + panels + verdict.

import type { Project } from "@/lib/stores/project";
import type { ModuleId, ModuleResult, QualitativeStat, MetricGroup } from "@/lib/stores/analysis";
import type { ReportResponse, ReportRow, LadderConfidence, VerdictLevel } from "@/lib/api/report";
import type { LayerSummaryData } from "@/lib/api/layerSummary";

export interface BuilderReportInput {
  project: Project;
  panels: Partial<Record<ModuleId, ModuleResult>>;
  verdict: ReportResponse | null;
  generatedAt: string;
  layerData?: LayerSummaryData | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return String(v);
}

const VERDICT_COLOR: Record<VerdictLevel, string> = {
  GO: "#1a7f37", CAUTION: "#b58100", NO_GO: "#b3261e",
};
const VERDICT_BG: Record<VerdictLevel, string> = {
  GO: "#f0fdf4", CAUTION: "#fffbeb", NO_GO: "#fff1f2",
};
const VERDICT_BORDER: Record<VerdictLevel, string> = {
  GO: "#bbf7d0", CAUTION: "#fde68a", NO_GO: "#fecdd3",
};

const CONF_COLOR: Record<LadderConfidence, string> = {
  authoritative: "#166534", derived: "#92400e", inferred: "#92400e", unresolved: "#6b7280",
};
const CONF_BG: Record<LadderConfidence, string> = {
  authoritative: "#dcfce7", derived: "#fef3c7", inferred: "#fef3c7", unresolved: "#f3f4f6",
};

const TONE_COLOR = { good: "#166534", warn: "#92400e", bad: "#b3261e", neutral: "#3A3F3B" };
const TONE_BG    = { good: "#f0fdf4", warn: "#fffbeb", bad: "#fff1f2", neutral: "#F7F4EF" };

function confBadge(conf: LadderConfidence | undefined): string {
  if (!conf) return "";
  const labels: Record<LadderConfidence, string> = { authoritative: "AUTHORITATIVE", derived: "DERIVED", inferred: "INFERRED", unresolved: "UNRESOLVED" };
  return `<span class="badge" style="background:${CONF_BG[conf]};color:${CONF_COLOR[conf]}">${labels[conf]}</span>`;
}

// ── Map iframe srcdoc ─────────────────────────────────────────────────────────

function buildMapSrcdoc(boundary: GeoJSON.Geometry | undefined): string {
  let initScript = "";

  if (boundary?.type === "Polygon" && Array.isArray(boundary.coordinates)) {
    const ring = (boundary.coordinates[0] as [number, number][])
      .map(([lon, lat]) => [lat, lon] as [number, number]);
    const ringJson = JSON.stringify(ring);
    initScript = `
      var ring = ${ringJson};
      var poly = L.polygon(ring, {
        color: '#306223', weight: 3, fillColor: '#306223', fillOpacity: 0.12
      }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding: [30, 30] });
    `;
  } else if (boundary?.type === "Point" && Array.isArray(boundary.coordinates)) {
    const [lon, lat] = boundary.coordinates as [number, number];
    initScript = `
      map.setView([${lat}, ${lon}], 16);
      L.circleMarker([${lat}, ${lon}], {
        radius: 14, color: '#306223', weight: 3, fillColor: '#306223', fillOpacity: 0.25
      }).addTo(map);
    `;
  } else {
    // Bengaluru default
    initScript = `map.setView([12.9716, 77.5946], 13);`;
  }

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}
.leaflet-control-attribution{font-size:9px}</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap contributors', subdomains:'abc', maxZoom:19
}).addTo(map);
${initScript}
</script></body></html>`;
}

// ── SVG bar chart for connectivity distances ──────────────────────────────────
// Reads from qualitative stats (where actual km values live), not indicators (always []).

function connectivityBarChart(qualitative: QualitativeStat[]): string {
  const items = qualitative.filter((s) =>
    /airport|metro|highway|rail/i.test(s.label) &&
    !/UNRESOLVED|Disclaimer/i.test(s.label) &&
    /\d+\.\d+\s*km/i.test(s.value)
  ).slice(0, 6);

  if (!items.length) return "<p style='color:#7B8F83;font-size:12px'>No connectivity distances resolved.</p>";

  const barW = 260;
  const rowH = 34;
  const svgH = items.length * rowH + 10;

  function barColor(v: number): string {
    if (v <= 5)  return "#1a7f37";
    if (v <= 20) return "#b58100";
    return "#b3261e";
  }

  const rows = items.map((item, i) => {
    // value format: "2.34 km (straight-line, derived)." — grab the leading number
    const rawNum = parseFloat(item.value) || 0;
    const isRoadWidth = /road width/i.test(item.label); // in metres, not km
    const displayKm = isRoadWidth ? rawNum / 1000 : rawNum;
    const maxKm = 60;
    const frac = Math.min(displayKm / maxKm, 1);
    const bW = Math.max(frac * barW, 2);
    const y = i * rowH + 8;
    const color = barColor(isRoadWidth ? 0 : rawNum);
    const valLabel = esc(item.value.split(" (")[0].trim());
    const shortLabel = esc(item.label.replace(/ — .*/, "").trim());
    return `
      <text x="0" y="${y + 13}" font-size="11" fill="#3A3F3B" font-family="system-ui,sans-serif">${shortLabel}</text>
      <rect x="0" y="${y + 17}" width="${bW.toFixed(1)}" height="8" rx="2" fill="${color}"/>
      <text x="${bW + 6}" y="${y + 25}" font-size="10" fill="${color}" font-weight="700" font-family="system-ui,sans-serif">${valLabel}</text>
    `;
  }).join("");

  return `<svg width="100%" viewBox="0 0 ${barW + 140} ${svgH}" xmlns="http://www.w3.org/2000/svg"
    style="overflow:visible;max-width:520px;display:block">${rows}</svg>`;
}

// ── Traffic-light grid for utilities ─────────────────────────────────────────

function utilitiesGrid(qualitative: QualitativeStat[]): string {
  if (!qualitative.length) return "<p style='color:#7B8F83;font-size:12px'>No utilities data resolved.</p>";

  const dotColor = (tone: string | undefined) => {
    if (tone === "good") return "#1a7f37";
    if (tone === "warn") return "#b58100";
    if (tone === "bad")  return "#b3261e";
    return "#9ca3af";
  };

  const cells = qualitative.map((s) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#FDFCFB;border:1px solid #CFD6C4;border-radius:7px">
      <span style="width:10px;height:10px;border-radius:50%;background:${dotColor(s.tone)};flex-shrink:0"></span>
      <div>
        <div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.05em">${esc(s.label)}</div>
        <div style="font-size:12px;color:#3A3F3B">${esc(s.value)}</div>
      </div>
    </div>
  `).join("");

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${cells}</div>`;
}

// ── Qualitative stats table ───────────────────────────────────────────────────

function qualTable(stats: QualitativeStat[]): string {
  if (!stats.length) return "";
  const rows = stats.map((s) => {
    const tone = s.tone ?? "neutral";
    // Truncate very long values (e.g. verbose unresolved reason text)
    const val = s.value.length > 200 ? s.value.slice(0, 197) + "…" : s.value;
    return `<tr>
      <td style="padding:6px 10px;font-size:11px;color:#7B8F83;font-weight:600;white-space:nowrap">${esc(s.label)}</td>
      <td style="padding:6px 10px;font-size:12px">
        <span style="padding:2px 7px;border-radius:4px;font-weight:600;background:${TONE_BG[tone]};color:${TONE_COLOR[tone]}">${esc(val)}</span>
      </td>
    </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

// ── Detail metrics table ──────────────────────────────────────────────────────

function detailTable(groups: MetricGroup[]): string {
  if (!groups.length) return "";
  return groups.map((g) => {
    const rows = g.rows.map((r) => `<tr>
      <td style="padding:5px 10px;font-size:11px;color:#7B8F83">${esc(r.label)}</td>
      <td style="padding:5px 10px;font-size:12px;font-weight:600;color:#3A3F3B">${esc(r.value)}${r.unit ? `<span style="font-weight:400;color:#7B8F83;font-size:10px"> ${esc(r.unit)}</span>` : ""}</td>
    </tr>`).join("");
    return `
      <div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.05em;margin:10px 0 4px">${esc(g.group)}</div>
      <table style="width:100%;border-collapse:collapse;background:#FAFAF9;border:1px solid #CFD6C4;border-radius:6px;overflow:hidden">${rows}</table>
    `;
  }).join("");
}

// ── Report row card ───────────────────────────────────────────────────────────

function rowCard(r: ReportRow): string {
  const borderColor = r.section === "red_flag" ? "#b3261e" : r.section === "confirm_to_upgrade" ? "#b58100" : "#1a7f37";
  const sevBadge = r.severity
    ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${borderColor}22;color:${borderColor};font-weight:700;text-transform:uppercase">${esc(r.severity)}</span> `
    : "";
  const meta = [
    r.citation ? `<span style="font-weight:600">${esc(r.citation)}</span>` : null,
    r.data_vintage ? `vintage ${esc(r.data_vintage)}` : null,
    r.as_of ? `as of ${esc(r.as_of)}` : null,
    `<em>${esc(r.sanction_note)}</em>`,
  ].filter(Boolean).join(" · ");

  return `
  <div style="border-left:3px solid ${borderColor};padding:8px 12px;margin:6px 0;background:#FDFCFB;border-radius:0 6px 6px 0;border-top:1px solid #CFD6C4;border-right:1px solid #CFD6C4;border-bottom:1px solid #CFD6C4">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:3px">
      <span style="font-size:13px;font-weight:700;color:#3A3F3B">${sevBadge}${esc(r.label)}</span>
      ${confBadge(r.confidence)}
    </div>
    <div style="font-size:12px;color:#3A3F3B;margin-bottom:3px">${esc(r.value)}</div>
    ${r.next_action ? `<div style="font-size:12px;color:#b58100;margin-bottom:3px">→ ${esc(r.next_action)}</div>` : ""}
    <div style="font-size:10px;color:#7B8F83">${meta}</div>
  </div>`;
}

// ── Signal panel card ─────────────────────────────────────────────────────────

function signalPanel(title: string, result: ModuleResult | undefined, customContent?: string): string {
  const r = result;
  const conf = r?.confidence;
  const src = r?.data_source;

  let body = "";
  if (!r || r.loading) {
    body = `<div style="background:#F7F4EF;border-radius:6px;padding:10px 12px;border:1px solid #E8E4DE">
      <div style="font-size:11px;font-weight:700;color:#9BA8A0">Data not resolved at report time</div>
    </div>`;
  } else if (r.error) {
    const isOffline = /unreachable|flag off|Failed to fetch/i.test(r.error);
    body = `<div style="background:#F7F4EF;border-radius:6px;padding:10px 12px;border:1px solid #E8E4DE">
      <div style="font-size:11px;font-weight:700;color:#9BA8A0">${isOffline ? "Service offline at report time" : "Data unavailable"}</div>
      <div style="font-size:10px;color:#B8C4BB;margin-top:3px">${isOffline ? "Start the relevant backend service and regenerate the report to populate this section." : esc(r.error)}</div>
    </div>`;
  } else {
    body = customContent ?? [
      r.summary ? `<p style="font-size:13px;color:#3A3F3B;margin:0 0 8px">${esc(r.summary)}</p>` : "",
      r.qualitative?.length ? qualTable(r.qualitative) : "",
      r.detailMetrics?.length ? detailTable(r.detailMetrics) : "",
    ].join("");
  }

  return `
  <div class="card" style="break-inside:avoid">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.07em">${esc(title)}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${conf ? confBadge(conf) : ""}
      </div>
    </div>
    ${body}
    ${src ? `<div style="margin-top:10px;font-size:9.5px;color:#B8C4BB;border-top:1px solid #CFD6C4;padding-top:6px">Source: ${esc(src)}</div>` : ""}
  </div>`;
}

// ── Section heading ───────────────────────────────────────────────────────────

function sectionHeading(text: string): string {
  return `<h2 style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#7B8F83;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #CFD6C4">${esc(text)}</h2>`;
}

// ── Infrastructure layer summary cards ───────────────────────────────────────

function distBadge(m: number | null): string {
  if (m == null) return `<span style="font-size:10px;color:#9BA8A0">—</span>`;
  const km = m / 1000;
  const label = km < 1 ? `${m} m` : `${km.toFixed(2)} km`;
  const color = m <= 200 ? "#1a7f37" : m <= 1000 ? "#b58100" : "#b3261e";
  return `<span style="font-size:10px;font-weight:700;color:${color}">${label}</span>`;
}

interface LayerCardDef {
  icon: string;
  title: string;
  count: number;
  nearestM: number | null;
  tone: "good" | "warn" | "bad" | "neutral";
  details: string[];
}

function layerCard({ icon, title, count, nearestM, tone, details }: LayerCardDef): string {
  const headerColor = tone === "good" ? "#1a7f37" : tone === "bad" ? "#b3261e" : tone === "warn" ? "#b58100" : "#3A3F3B";
  const headerBg    = tone === "good" ? "#f0fdf4" : tone === "bad" ? "#fff1f2" : tone === "warn" ? "#fffbeb" : "#F7F4EF";
  const countLabel = count === 0 ? "None detected" : `${count} feature${count !== 1 ? "s" : ""}`;
  const detailRows = details.map((d) => `<div style="font-size:11px;color:#3A3F3B;padding:2px 0;border-bottom:1px solid #F0EDEA">${esc(d)}</div>`).join("");
  return `
  <div class="card" style="padding:0;overflow:hidden;break-inside:avoid">
    <div style="background:${headerBg};padding:10px 14px;border-bottom:1px solid #CFD6C4;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">${icon}</span>
        <span style="font-size:11px;font-weight:800;color:${headerColor};text-transform:uppercase;letter-spacing:0.05em">${esc(title)}</span>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:10px;color:#7B8F83">Nearest</div>
        ${distBadge(nearestM)}
      </div>
    </div>
    <div style="padding:10px 14px">
      <div style="font-size:10px;font-weight:700;color:#9BA8A0;margin-bottom:6px">${countLabel}</div>
      ${detailRows}
    </div>
  </div>`;
}

function buildLayerSummaryHtml(ld: LayerSummaryData): string {
  const gasCount = ld.gasPipelines.count;
  const gasTone  = gasCount === 0 ? "neutral" : ld.gasPipelines.confirmed > 0 ? "good" : "warn";

  const sewerCount = ld.sewerageMain.count;
  const sewerTone  = sewerCount === 0 ? "neutral" : (ld.sewerageMain.nearestM ?? 9999) <= 500 ? "good" : "warn";

  const swdTone = ld.stormDrains.count === 0 ? "neutral" : "good";
  const encrTone = ld.encroachment.count === 0 ? "good" : "bad";
  const wbTone = ld.waterBodies.count === 0 ? "neutral" : "warn";

  const pwrKv = ld.powerGrid.maxVoltageKv;
  const pwrTone = ld.powerGrid.count === 0 ? "neutral"
    : pwrKv && pwrKv >= 220 ? "good"   // HV/EHV — strong grid
    : pwrKv && pwrKv >= 66  ? "good"
    : "warn";

  // Power grid voltage table
  const pwrLinesHtml = ld.powerGrid.lines.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px">
        <thead><tr>
          <th style="text-align:left;padding:3px 6px;color:#7B8F83;font-size:9.5px;text-transform:uppercase">Voltage</th>
          <th style="text-align:left;padding:3px 6px;color:#7B8F83;font-size:9.5px;text-transform:uppercase">Name</th>
          <th style="text-align:right;padding:3px 6px;color:#7B8F83;font-size:9.5px;text-transform:uppercase">Distance</th>
        </tr></thead>
        <tbody>${ld.powerGrid.lines.map((l) => `<tr>
          <td style="padding:3px 6px;font-weight:700;color:#3A3F3B">${l.voltageKv > 0 ? `${l.voltageKv} kV` : "—"}</td>
          <td style="padding:3px 6px;color:#3A3F3B">${esc(l.name ?? "Unnamed line")}</td>
          <td style="padding:3px 6px;text-align:right;color:#7B8F83">${l.distanceM} m</td>
        </tr>`).join("")}</tbody>
      </table>`
    : "";

  return `<div class="panel-grid">
    ${layerCard({ icon: "⚡", title: "Power Grid (OSM)", count: ld.powerGrid.count, nearestM: ld.powerGrid.nearestM, tone: pwrTone, details: ld.powerGrid.details })}
    ${layerCard({ icon: "🔥", title: "Gas Pipelines", count: gasCount, nearestM: ld.gasPipelines.nearestM, tone: gasTone, details: ld.gasPipelines.details })}
    ${layerCard({ icon: "💧", title: "BWSSB Sewerage", count: sewerCount, nearestM: ld.sewerageMain.nearestM, tone: sewerTone, details: ld.sewerageMain.details })}
    ${layerCard({ icon: "🌊", title: "Storm Drains (BBMP)", count: ld.stormDrains.count, nearestM: ld.stormDrains.nearestM, tone: swdTone, details: ld.stormDrains.details })}
    ${layerCard({ icon: "⚠", title: "Encroachment Risk", count: ld.encroachment.count, nearestM: ld.encroachment.nearestM, tone: encrTone, details: ld.encroachment.details })}
    ${layerCard({ icon: "🏞", title: "Water Bodies", count: ld.waterBodies.count, nearestM: ld.waterBodies.nearestM, tone: wbTone, details: ld.waterBodies.details })}
  </div>
  ${pwrLinesHtml ? `<div class="card" style="margin-top:12px"><div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">⚡ Power Lines — Nearest 5 (OSM)</div>${pwrLinesHtml}</div>` : ""}`;
}

// ── Data sources collection ───────────────────────────────────────────────────

function buildSourcesTable(
  panels: Partial<Record<ModuleId, ModuleResult>>,
  rows: ReportRow[],
): string {
  const seen = new Set<string>();
  const sources: { source: string; usedFor: string; confidence: string }[] = [];

  // From panel data_source
  const PANEL_LABELS: Partial<Record<ModuleId, string>> = {
    zoneRing: "Zone & Ring", farAssembly: "FAR / Planning Norms",
    obligations: "Parking & TIA", overlays: "Deal-Killer Overlays",
    terrain: "Terrain", connectivitySignal: "Connectivity",
    utilities: "Utilities & NOC", priceUpside: "Price Upside",
    growth: "Growth Pipeline",
  };
  for (const [id, r] of Object.entries(panels) as [ModuleId, ModuleResult | undefined][]) {
    if (!r?.data_source) continue;
    const key = r.data_source.trim();
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ source: key, usedFor: PANEL_LABELS[id] ?? id, confidence: r.confidence ?? "unresolved" });
    }
  }

  // From row citations
  for (const r of rows) {
    if (!r.citation) continue;
    const key = r.citation.trim();
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ source: key, usedFor: r.label, confidence: r.confidence });
    }
  }

  // Standard baseline entries
  const baseline = [
    { source: "OpenStreetMap (ODbL)", usedFor: "Road network, amenities, power infrastructure", confidence: "derived" },
    { source: "BDA RMP-2015 / CDP-2031", usedFor: "Zone classification, FAR tables, ring boundaries", confidence: "authoritative" },
    { source: "BBMP Bylaws 2020", usedFor: "Setbacks, height limits, parking norms", confidence: "authoritative" },
    { source: "KSRSAC KGIS", usedFor: "Cadastral parcel geometry", confidence: "derived" },
    { source: "Karnataka CMDA / BMRDA", usedFor: "Peri-urban land use classification", confidence: "derived" },
  ];
  for (const b of baseline) {
    if (!seen.has(b.source)) {
      seen.add(b.source);
      sources.push(b as { source: string; usedFor: string; confidence: string });
    }
  }

  const confLabel: Record<string, string> = {
    authoritative: "Authoritative", derived: "Derived", inferred: "Inferred", unresolved: "Unresolved",
  };

  const tbody = sources.map((s) => `<tr>
    <td>${esc(s.source)}</td>
    <td>${esc(s.usedFor)}</td>
    <td>${confLabel[s.confidence] ?? esc(s.confidence)}</td>
  </tr>`).join("");

  return `<table class="src-table">
    <thead><tr><th>Source</th><th>Used For</th><th>Confidence</th></tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  :root {
    --brand: #306223; --brand-tint: #DAEBE3; --cream: #FDFCFB;
    --bg: #F7F4EF; --border: #CFD6C4; --dark: #3A3F3B; --muted: #7B8F83;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    background: var(--bg); color: var(--dark); font-size: 14px; line-height: 1.5;
  }
  .report-wrap { max-width: 900px; margin: 0 auto; padding: 0 16px 48px; }
  .header-bar {
    background: var(--brand); color: #fff; padding: 14px 28px;
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 0;
  }
  .header-bar .brand { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.85; }
  .header-bar .date { font-size: 11px; opacity: 0.75; }
  .project-block {
    background: var(--cream); border-bottom: 1px solid var(--border);
    padding: 20px 28px 16px;
  }
  .project-name { font-size: 26px; font-weight: 800; color: var(--dark); margin: 0 0 4px; }
  .project-meta { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 16px; }
  .disclaimer-bar {
    background: #fffbeb; border-top: 1px solid #fde68a; border-bottom: 1px solid #fde68a;
    padding: 8px 28px; font-size: 11px; color: #92400e; font-weight: 600;
  }
  .card {
    background: var(--cream); border: 1px solid var(--border); border-radius: 10px;
    padding: 16px 18px; margin-bottom: 12px;
    box-shadow: 0 1px 4px rgba(58,63,59,0.06);
  }
  .verdict-card {
    border-radius: 10px; padding: 24px 28px; margin-bottom: 0;
    border-width: 1px; border-style: solid;
  }
  .verdict-label { font-size: 42px; font-weight: 900; letter-spacing: -1px; margin: 0 0 6px; }
  .verdict-headline { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
  .verdict-note { font-size: 13px; padding: 10px 14px; border-radius: 6px; background: rgba(0,0,0,0.04); margin-bottom: 12px; }
  .verdict-counters { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 14px; }
  .verdict-counter { font-size: 13px; font-weight: 700; }
  .badge {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 9.5px; font-weight: 800; letter-spacing: 0.06em;
  }
  .panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .panel-grid .card { margin-bottom: 0; }
  .map-wrap { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 0; }
  .map-note { font-size: 10px; color: var(--muted); text-align: center; padding: 5px 0 0; }
  .src-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .src-table th {
    background: var(--brand); color: #fff; padding: 8px 12px;
    text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .src-table td { padding: 7px 12px; border-bottom: 1px solid var(--border); }
  .src-table tr:last-child td { border-bottom: none; }
  .src-table tr:nth-child(even) td { background: #F7F4EF; }
  .conf-ladder { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  .conf-ladder th { padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted); border-bottom: 2px solid var(--border); text-align: left; }
  .conf-ladder td { padding: 7px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  @media print {
    body { background: #fff; }
    .header-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .card, .verdict-card { box-shadow: none; break-inside: avoid; }
    .panel-grid { break-inside: avoid; }
    .map-wrap { break-inside: avoid; }
  }
  @media (max-width: 600px) {
    .panel-grid { grid-template-columns: 1fr; }
    .header-bar { flex-direction: column; gap: 4px; text-align: center; }
    .verdict-label { font-size: 32px; }
  }
`;

// ── Main generator ────────────────────────────────────────────────────────────

export function generateBuilderReportHtml(input: BuilderReportInput): string {
  const { project, panels, verdict, generatedAt, layerData } = input;
  const v = verdict?.verdict ?? null;

  const genDate = new Date(generatedAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const areaSqm = project.area_sqm ?? 0;
  const areaLabel = areaSqm > 0
    ? `${areaSqm.toLocaleString("en-IN")} m² (${(areaSqm / 10000).toFixed(3)} ha)`
    : null;
  const surveyNo = v?.parcel.survey_number ? `Survey No. ${esc(v.parcel.survey_number)}` : null;

  const allRows: ReportRow[] = v ? [...v.red_flags, ...v.confirmed_clear, ...v.confirm_to_upgrade] : [];

  // ── Verdict hero ──
  let verdictHtml = "";
  if (v) {
    const vColor  = VERDICT_COLOR[v.verdict];
    const vBg     = VERDICT_BG[v.verdict];
    const vBorder = VERDICT_BORDER[v.verdict];
    const confLabels: Record<LadderConfidence, string> = { authoritative: "AUTHORITATIVE", derived: "DERIVED", inferred: "INFERRED", unresolved: "UNRESOLVED" };
    const nRed   = v.red_flags.length;
    const nClear = v.confirmed_clear.length;
    const nUpg   = v.confirm_to_upgrade.length;

    verdictHtml = `
    <div class="verdict-card" style="background:${vBg};border-color:${vBorder}">
      <div class="verdict-label" style="color:${vColor}">${esc(v.verdict.replace("_", "-"))}</div>
      <div style="margin-bottom:10px">${confBadge(v.confidence)}</div>
      <div class="verdict-headline">${esc(v.headline)}</div>
      <div class="verdict-note">${esc(v.confidence_note)}</div>
      <div class="verdict-counters">
        <span class="verdict-counter" style="color:#b3261e">🚩 ${nRed} Red Flag${nRed !== 1 ? "s" : ""}</span>
        <span class="verdict-counter" style="color:#1a7f37">✓ ${nClear} Confirmed Clear</span>
        <span class="verdict-counter" style="color:#b58100">⚠ ${nUpg} To Verify</span>
      </div>
    </div>`;
  } else {
    verdictHtml = `
    <div class="card" style="border-color:#fde68a;background:#fffbeb">
      <div style="font-size:16px;font-weight:800;color:#92400e">Verdict not available</div>
      <p style="font-size:13px;color:#92400e">The report service did not respond. Signal panel data below is still accurate.</p>
    </div>`;
  }

  // ── Findings ──
  let findingsHtml = "";
  if (v && allRows.length) {
    const redRows   = v.red_flags;
    const clearRows = v.confirmed_clear;
    const upgRows   = v.confirm_to_upgrade;

    findingsHtml = sectionHeading("Findings");
    if (redRows.length) {
      findingsHtml += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#b3261e;letter-spacing:0.06em;margin:10px 0 4px">Red Flags — Resolve First</div>`;
      findingsHtml += redRows.map(rowCard).join("");
    }
    if (clearRows.length) {
      findingsHtml += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1a7f37;letter-spacing:0.06em;margin:14px 0 4px">Confirmed Clear</div>`;
      findingsHtml += clearRows.map(rowCard).join("");
    }
    if (upgRows.length) {
      findingsHtml += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#b58100;letter-spacing:0.06em;margin:14px 0 4px">Confirm to Upgrade</div>`;
      findingsHtml += upgRows.map(rowCard).join("");
    }
  }

  // ── Signal panels ──
  const connectivityPanel = (() => {
    const r = panels.connectivitySignal;
    const chart = connectivityBarChart(r?.qualitative ?? []);
    // Drop verbose Disclaimer row + truncate long unresolved "not fetchable" reason text
    const connQual = (r?.qualitative ?? [])
      .filter((s) => !/Disclaimer/i.test(s.label))
      .map((s) => ({
        ...s,
        value: s.value.length > 120 ? s.value.slice(0, 117) + "…" : s.value,
      }));
    const qual = connQual.length ? qualTable(connQual) : "";
    return signalPanel("Connectivity — Airport / Metro / Road", r, `
      ${r?.summary ? `<p style="font-size:13px;color:#3A3F3B;margin:0 0 10px">${esc(r.summary)}</p>` : ""}
      ${chart}
      ${qual}
    `);
  })();

  const utilitiesPanel = (() => {
    const r = panels.utilities;
    const qual = r?.qualitative ?? [];
    const grid = utilitiesGrid(qual);
    const detail = r?.detailMetrics?.length ? detailTable(r.detailMetrics) : "";
    return signalPanel("Utilities & NOC", r, `
      ${r?.summary ? `<p style="font-size:13px;color:#3A3F3B;margin:0 0 10px">${esc(r.summary)}</p>` : ""}
      ${grid}
      ${detail}
    `);
  })();

  const panelGrid = `
  <div class="panel-grid">
    ${signalPanel("Zone & Ring (RMP)", panels.zoneRing)}
    ${signalPanel("FAR — Permissible vs Achievable", panels.farAssembly)}
    ${signalPanel("Parking & Obligations", panels.obligations)}
    ${signalPanel("Deal-Killer Overlays", panels.overlays)}
    ${signalPanel("Terrain — Slope / Geotech", panels.terrain)}
    ${signalPanel("Price Upside (Indicative)", panels.priceUpside)}
    ${signalPanel("Growth Pipeline", panels.growth)}
  </div>
  ${connectivityPanel}
  ${utilitiesPanel}
  `;

  // ── Regulatory framework ──
  const regPanel = (() => {
    const r = panels.zoneRing;
    const far = panels.farAssembly;
    // All zone/ring qualitative stats (zone class, ring, next_action) are regulatory context.
    const zoneStats = r?.qualitative ?? [];
    // FAR qualitative has permissible/achievable FAR + entitlements + disclaimer.
    const farStats = far?.qualitative?.filter((s) => !/Disclaimer/i.test(s.label)) ?? [];
    const hasData = zoneStats.length > 0 || farStats.length > 0;
    const body = `
      ${zoneStats.length ? `<div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px">Zone &amp; Ring</div>${qualTable(zoneStats)}` : ""}
      ${farStats.length ? `<div style="font-size:10px;font-weight:700;color:#7B8F83;text-transform:uppercase;letter-spacing:0.05em;margin:14px 0 6px">FAR / Planning Norms</div>${qualTable(farStats)}` : ""}
      ${!hasData ? "<p style='color:#7B8F83;font-size:12px'>Regulatory data not resolved — enable the geo and planning services.</p>" : ""}
    `;
    return signalPanel("Regulatory Framework", r, body);
  })();

  // ── Service status pill row ──
  const STATUS_LABELS: Partial<Record<ModuleId, string>> = {
    zoneRing: "Zone/Ring", farAssembly: "FAR", obligations: "Obligations",
    overlays: "Overlays", terrain: "Terrain", connectivitySignal: "Connectivity",
    utilities: "Utilities", priceUpside: "Price", growth: "Growth",
  };
  const statusPills = (Object.entries(STATUS_LABELS) as [ModuleId, string][]).map(([id, label]) => {
    const r = panels[id];
    const ok = r && !r.loading && !r.error;
    const unresolved = r && !r.loading && !r.error && r.confidence === "unresolved";
    const err = r?.error;
    const color = ok && !unresolved ? "#1a7f37" : err ? "#9BA8A0" : "#b58100";
    const bg = ok && !unresolved ? "#f0fdf4" : err ? "#F7F4EF" : "#fffbeb";
    const sym = ok && !unresolved ? "✓" : err ? "–" : "⚠";
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;background:${bg};color:${color};font-size:10px;font-weight:700;border:1px solid ${color}40">${sym} ${label}</span>`;
  }).join("");
  const offlinePanels = (Object.entries(STATUS_LABELS) as [ModuleId, string][])
    .filter(([id]) => panels[id]?.error)
    .map(([, label]) => label);
  const offlineNote = offlinePanels.length
    ? `<div style="margin-top:8px;padding:8px 10px;background:#F7F4EF;border-radius:6px;border:1px solid #E8E4DE;font-size:10px;color:#9BA8A0">
        <strong style="color:#7B8F83">Not resolved:</strong> ${offlinePanels.join(", ")} —
        start the missing backend service(s) and regenerate the report.
      </div>`
    : "";
  const serviceStatusHtml = `
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">${statusPills}</div>
  <p style="font-size:10px;color:#7B8F83;margin:4px 0 0">✓ resolved &nbsp;·&nbsp; ⚠ unresolved input &nbsp;·&nbsp; – service offline</p>
  ${offlineNote}
  `;

  // ── Map srcdoc ──
  const mapSrcdoc = buildMapSrcdoc(project.boundary);
  const mapHtml = `
  <div class="map-wrap">
    <iframe srcdoc="${esc(mapSrcdoc)}" width="100%" height="480" style="border:none;display:block" loading="lazy" title="Site map"></iframe>
  </div>
  <p class="map-note">Interactive — pan and zoom to explore the site boundary. Source: © OpenStreetMap contributors (ODbL).</p>
  `;

  // ── Data sources ──
  const sourcesHtml = buildSourcesTable(panels, allRows);

  // ── Disclaimer ──
  const disclaimer = v?.disclaimer ?? "This report is a planning aid. All figures subject to authority sanction before any development decision is taken.";

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site Feasibility Report — ${esc(project.name)}</title>
<style>${CSS}</style>
</head>
<body>

<div class="header-bar">
  <span class="brand">Qnit · Site Feasibility Report</span>
  <span class="date">Generated ${esc(genDate)}</span>
</div>

<div class="project-block">
  <h1 class="project-name">${esc(project.name)}</h1>
  <div class="project-meta">
    ${project.location ? `<span>📍 ${esc(project.location)}</span>` : ""}
    ${areaLabel        ? `<span>📐 ${esc(areaLabel)}</span>` : ""}
    ${surveyNo         ? `<span>📋 ${esc(surveyNo)}</span>` : ""}
    ${v               ? `<span>🌐 ${v.parcel.lat.toFixed(5)}, ${v.parcel.lon.toFixed(5)}</span>` : ""}
  </div>
</div>
<div class="disclaimer-bar">⚠ All figures subject to authority sanction. Unresolved inputs are shown as "confirm to upgrade" — never silently passed.</div>

<div class="report-wrap">

${sectionHeading("Verdict")}
${verdictHtml}

${sectionHeading("Site Map")}
${mapHtml}

${findingsHtml}

${sectionHeading("Builder Signals")}
<div class="card" style="padding:12px 16px;margin-bottom:12px">${serviceStatusHtml}</div>
${panelGrid}

${sectionHeading("Regulatory Framework")}
${regPanel}

${layerData ? `${sectionHeading("Infrastructure Near Site")}
<p style="font-size:11px;color:#7B8F83;margin:-4px 0 12px">Data from cadastral service (BWSSB, BBMP, gas network). Distances to nearest detected feature from site centre.</p>
${buildLayerSummaryHtml(layerData)}` : ""}

${sectionHeading("Data Sources")}
<div class="card" style="padding:0;overflow:hidden">
${sourcesHtml}
</div>

${sectionHeading("Validation & Disclaimer")}
<div class="card">
  <p style="font-size:13px;color:#3A3F3B;margin:0 0 12px">${esc(disclaimer)}</p>
  <p style="font-size:12px;color:#7B8F83;margin:0 0 14px">
    This report was generated by the Qnit Site Analysis Tool on ${esc(genDate)}.
    It is a planning aid, not a legal document. All measurements, zone classifications, and
    infrastructure readiness assessments require independent verification with the relevant
    authority before any investment or development decision is taken.
  </p>
  <table class="conf-ladder">
    <thead><tr><th>Confidence</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>${confBadge("authoritative")}</td><td>Data sourced directly from the issuing authority (BDA, BBMP, KPTCL, etc.). Least likely to be wrong.</td></tr>
      <tr><td>${confBadge("derived")}</td><td>Computed or inferred from authoritative raw data (e.g. OSM + BDA zone map overlay). Verify before filing.</td></tr>
      <tr><td>${confBadge("inferred")}</td><td>Model-derived from proxy inputs. Flag for field verification.</td></tr>
      <tr><td>${confBadge("unresolved")}</td><td>Input data not available. Treat as unknown — never a silent pass.</td></tr>
    </tbody>
  </table>
  <p style="font-size:10px;color:#B8C4BB;margin:14px 0 0">
    Report ID: ${esc(verdict?.report_id ?? "N/A")} · Qnit Site Analysis Tool · © ${new Date().getFullYear()} Qnit.
    OpenStreetMap data © OpenStreetMap contributors, ODbL.
  </p>
</div>

</div>
</body>
</html>`;
}
