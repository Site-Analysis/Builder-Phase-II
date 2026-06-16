"use client";

// Client-side export generators. Heavy libs (jsPDF, html2canvas) are imported
// dynamically inside each function so they never touch the SSR bundle.
//
// The PDF/PNG generators read from a live, on-screen (offscreen-positioned)
// ReportDocument DOM tree. They rely on these data hooks rendered by it:
//   [data-export-page]  — one node per PDF page (captured in order)
//   [data-chart]         — one node per chart (title in data-chart attr)

import type { Project } from "@/lib/stores/project";
import type { ModuleId, ModuleResult, SiteScore } from "@/lib/stores/analysis";

type Modules = Partial<Record<ModuleId, ModuleResult>>;

const PAGE_BG = "#FDFCFB";

// ── Paper size → jsPDF format/orientation ──────────────────────────────────
function paperConfig(paperSize: string): { format: string; orientation: "portrait" | "landscape" } {
  switch (paperSize) {
    case "A4 Landscape": return { format: "a4", orientation: "landscape" };
    case "A3":           return { format: "a3", orientation: "portrait" };
    case "A4 Portrait":
    default:             return { format: "a4", orientation: "portrait" };
  }
}

function sanitize(name: string): string {
  return name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── PDF — one image page per [data-export-page] section ─────────────────────
export async function generatePdf(rootEl: HTMLElement, baseName: string, paperSize: string) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasMod.default;

  const { format, orientation } = paperConfig(paperSize);
  const doc = new jsPDF({ unit: "pt", format, orientation, compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const sections = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-export-page]"));
  const nodes = sections.length ? sections : [rootEl];

  let first = true;
  for (const node of nodes) {
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: PAGE_BG,
      useCORS: true,
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    // Fit within the page, preserving aspect ratio.
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = 0;

    if (!first) doc.addPage(format, orientation);
    first = false;
    doc.addImage(imgData, "JPEG", x, y, w, h);
  }

  doc.save(`${sanitize(baseName)}-site-analysis.pdf`);
}

// ── PNG — one file per [data-chart] node ────────────────────────────────────
export async function exportChartPngs(rootEl: HTMLElement, baseName: string) {
  const html2canvasMod = await import("html2canvas");
  const html2canvas = html2canvasMod.default;

  const charts = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-chart]"));
  if (charts.length === 0) return 0;

  let i = 0;
  for (const node of charts) {
    i += 1;
    const title = node.getAttribute("data-chart") || `chart-${i}`;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: PAGE_BG,
      useCORS: true,
      logging: false,
    });
    await new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${sanitize(baseName)}-${sanitize(title)}.png`);
        resolve();
      }, "image/png");
    });
  }
  return charts.length;
}

// ── CSV — flattened indicators + detail metrics ─────────────────────────────
function csvCell(v: string | number | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const MODULE_LABEL: Record<ModuleId, string> = {
  sunpath: "Sun Path", flood: "Flood", temperature: "Temperature", wind: "Wind", rainfall: "Rainfall",
  zone: "Zone & Land Use", planning: "Site Capacity", zoning: "Zoning Compliance",
  infrastructure: "Connectivity",
  soil: "Soil Profile", waterConstraints: "Water Constraints", growth: "Growth Context", land: "Title & Documents",
  amenities: "Amenities",
};

export function exportCsv(project: Project | null, modules: Modules, baseName: string) {
  const rows: string[] = ["Module,Section,Label,Value,Unit,Citation"];

  (Object.keys(modules) as ModuleId[]).forEach((id) => {
    const r = modules[id];
    if (!r || r.loading || r.error) return;
    const mod = MODULE_LABEL[id] ?? id;

    rows.push([csvCell(mod), csvCell("Summary"), csvCell("Score"), csvCell(r.score), csvCell("/100"), csvCell(r.data_source)].join(","));

    r.indicators?.forEach((ind) => {
      rows.push([csvCell(mod), csvCell("Indicators"), csvCell(ind.label), csvCell(ind.value), csvCell(ind.unit), csvCell(ind.citation)].join(","));
    });
    r.detailMetrics?.forEach((g) => {
      g.rows.forEach((row) => {
        rows.push([csvCell(mod), csvCell(g.group), csvCell(row.label), csvCell(row.value), csvCell(row.unit), csvCell("")].join(","));
      });
    });
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${sanitize(baseName)}-metrics.csv`);
}

// ── JSON — raw project + scores + module results ────────────────────────────
export function exportJson(project: Project | null, siteScore: SiteScore | null, modules: Modules, baseName: string) {
  const payload = {
    exported_at: new Date().toISOString(),
    project,
    site_score: siteScore,
    modules,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${sanitize(baseName)}-data.json`);
}
