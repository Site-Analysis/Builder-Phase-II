import type { SolarPoint } from "./stores/analysis";

export function daytime(pts: SolarPoint[]): SolarPoint[] {
  return pts.filter((p) => p.el > 0);
}

// Interpolated sun azimuth/elevation at a fractional hour.
export function sunAt(pts: SolarPoint[], hour: number): { az: number; el: number } {
  if (!pts.length) return { az: 180, el: 0 };
  const lo = Math.floor(hour);
  const hi = Math.min(lo + 1, 23);
  const f = hour - lo;
  const a = pts.find((p) => p.hour === lo) ?? pts[0];
  const b = pts.find((p) => p.hour === hi) ?? a;
  let daz = b.az - a.az;
  if (daz > 180) daz -= 360;
  if (daz < -180) daz += 360;
  return { az: (a.az + daz * f + 360) % 360, el: a.el + (b.el - a.el) * f };
}

// Daylight hour window (sun above horizon) for the slider bounds.
export function dayRange(pts: SolarPoint[]): { start: number; end: number } {
  const d = daytime(pts);
  if (!d.length) return { start: 6, end: 18 };
  const hrs = d.map((p) => p.hour);
  return { start: Math.min(...hrs), end: Math.max(...hrs) };
}

// Shadow length (metres) for a vertical element of height h at sun elevation el.
export function shadowLength(h: number, elDeg: number): number {
  if (elDeg <= 1) return 0;
  const L = h / Math.tan((elDeg * Math.PI) / 180);
  return Math.min(Math.max(L, 0), 500);
}

export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ── Stereographic chart helpers (panel diagram) ───────────────────────────────

// Daytime hours shared across all supplied curves — used to draw the analemma
// "hour lines" that connect the same hour across summer/equinox/winter.
export function sharedHours(curves: SolarPoint[][]): number[] {
  const sets = curves.map((c) => new Set(daytime(c).map((p) => p.hour)));
  const base = sets[0] ?? new Set<number>();
  return [...base].filter((h) => sets.every((s) => s.has(h))).sort((a, b) => a - b);
}

// For a given hour, the [az, el] of that hour on each curve (skips curves where
// the sun is below the horizon at that hour). Drives the vertical hour lines.
export function hourLine(curves: SolarPoint[][], hour: number): SolarPoint[] {
  return curves
    .map((c) => c.find((p) => p.hour === hour))
    .filter((p): p is SolarPoint => !!p && p.el > 0);
}

// Closed SVG path enclosing the summer (outer) and winter (inner) daytime curves
// — the pale "envelope band" of reachable sun positions across the year.
// `proj` maps (az, el) → [x, y] in the diagram's coordinate space.
export function envelopePath(
  summer: SolarPoint[],
  winter: SolarPoint[],
  proj: (az: number, el: number) => [number, number],
): string {
  const out = daytime(summer);
  const inn = daytime(winter);
  if (out.length < 2 || inn.length < 2) return "";
  const fwd = out.map((p, i) => `${i === 0 ? "M" : "L"}${proj(p.az, p.el).map((n) => n.toFixed(1)).join(" ")}`);
  const back = [...inn].reverse().map((p) => `L${proj(p.az, p.el).map((n) => n.toFixed(1)).join(" ")}`);
  return `${fwd.join("")}${back.join("")}Z`;
}
