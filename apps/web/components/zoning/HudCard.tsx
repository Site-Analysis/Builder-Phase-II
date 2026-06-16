"use client";

import type { ReactNode } from "react";
import { Z, sevColor } from "./theme";

export type HudCorner = "tl" | "tr" | "bl" | "br";

interface HudCardProps {
  title: string;
  subtitle?: string;
  score?: number;
  severity?: string;
  corner: HudCorner;
  width: number;
  maxHeight?: number | string;
  children: ReactNode;
  footer?: ReactNode;
}

const CORNER_POS: Record<HudCorner, Record<string, number>> = {
  tl: { top: 14, left: 14 },
  tr: { top: 14, right: 14 },
  bl: { bottom: 22, left: 14 },
  br: { bottom: 22, right: 14 },
};

const VERDICT: Record<string, string> = {
  high: "High risk", moderate: "Caution", low: "Favourable", none: "Favourable",
};

// Floating glass card pinned to a map corner. Entrance fade via inline keyframes
// injected once. pointerEvents auto so the card is interactive over the map.
export function HudCard({ title, subtitle, score, severity, corner, width, maxHeight, children, footer }: HudCardProps) {
  const pos = CORNER_POS[corner];

  return (
    <div
      style={{
        position: "absolute", ...pos, width, zIndex: 420,
        background: Z.surface, borderRadius: 12,
        boxShadow: "0 6px 24px rgba(58,63,59,0.16)",
        border: `1px solid ${Z.border}`,
        backdropFilter: "blur(3px)",
        pointerEvents: "auto",
        maxHeight, overflowY: maxHeight ? "auto" : "visible",
        animation: "zHudIn 0.32s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <style>{`@keyframes zHudIn{from{opacity:0;transform:translateY(6px) scale(0.985)}to{opacity:1;transform:none}}`}</style>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px", borderBottom: `1px solid ${Z.border}`,
      }}>
        <span style={{ width: 4, height: 22, borderRadius: 2, background: Z.amber, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: Z.ink, letterSpacing: "0.3px", textTransform: "uppercase" }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 8.5, color: Z.inkSoft, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {subtitle}
            </div>
          )}
        </div>
        {score != null && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: 21, fontWeight: 700, lineHeight: 1, color: sevColor(severity ?? "none"),
              fontFamily: "var(--font-geist-mono), monospace",
            }}>
              {score}<span style={{ fontSize: 9, color: Z.inkFaint, fontWeight: 400 }}>/100</span>
            </div>
            {severity && (
              <div style={{ fontSize: 8, color: sevColor(severity), fontWeight: 700, marginTop: 1 }}>
                {VERDICT[severity] ?? ""}
              </div>
            )}
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ padding: "10px 12px" }}>{children}</div>

      {footer && (
        <div style={{ padding: "7px 12px", borderTop: `1px solid ${Z.border}`, fontSize: 8, color: Z.inkFaint, lineHeight: 1.4 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// Small amber-tinted classification chip.
export function ZoneChip({ label, tone = Z.amber, bg = Z.amberTint }: { label: string; tone?: string; bg?: string }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 9, fontWeight: 700, color: tone, background: bg,
      borderRadius: 5, padding: "2px 7px", letterSpacing: "0.2px",
    }}>{label}</span>
  );
}
