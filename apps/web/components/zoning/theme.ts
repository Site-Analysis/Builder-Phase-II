// Shared palette + SVG geometry helpers for the zoning HUD visuals.
// Inline-style hex values mirror the @theme tokens in globals.css so the map
// overlays stay self-contained (the Leaflet overlay pane sits outside Tailwind).

export const Z = {
  amber: "#B45309",
  amberSoft: "#D97706",
  amberTint: "#FBEEE0",
  surface: "rgba(253,252,251,0.97)",
  surfaceSolid: "#FDFCFB",
  bg: "#F2EDE8",
  border: "#CFD6C4",
  ink: "#3A3F3B",
  inkSoft: "#7B8F83",
  inkFaint: "#B8C4BB",
  good: "#5A8F6A",
  goodBg: "#E4F0E8",
  warn: "#C4865A",
  warnBg: "#F8EDE0",
  bad: "#C46A6A",
  badBg: "#F5E4E4",
  info: "#5B93C9",
} as const;

export type Status = "pass" | "caution" | "blocked" | "info";

export const STATUS_COLOR: Record<Status, string> = {
  pass: Z.good,
  caution: Z.warn,
  blocked: Z.bad,
  info: Z.info,
};
export const STATUS_BG: Record<Status, string> = {
  pass: Z.goodBg,
  caution: Z.warnBg,
  blocked: Z.badBg,
  info: "#E7EEF6",
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

// Polar point with angle measured clockwise from 12 o'clock (top).
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// SVG arc path from a0 → a1 (degrees, clockwise from top). sweep-flag = 1.
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

// Severity → headline colour for score rings/badges.
export function sevColor(sev: string): string {
  return sev === "high" ? Z.bad : sev === "moderate" ? Z.warn : sev === "low" ? Z.good : Z.good;
}

// Human distance label.
export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}
