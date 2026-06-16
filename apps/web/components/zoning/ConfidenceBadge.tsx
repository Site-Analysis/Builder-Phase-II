"use client";

import type { ConfidenceTier } from "@/lib/zoning/provenance";
import { TIER_LABEL } from "@/lib/zoning/provenance";

export const TIER_COLOR: Record<ConfidenceTier, string> = {
  authoritative: "#5A8F6A", // green
  official: "#2F7E8C",      // teal
  modelled: "#C4865A",      // amber
  community: "#9CA3AF",     // grey
};

// Small confidence-tier pill (dot + label). `dotOnly` for tight rows.
export function ConfidenceBadge({ tier, dotOnly }: { tier: ConfidenceTier; dotOnly?: boolean }) {
  const color = TIER_COLOR[tier];
  if (dotOnly) {
    return <span title={TIER_LABEL[tier]} style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8.5, fontWeight: 700,
      color, background: `${color}1F`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {TIER_LABEL[tier]}
    </span>
  );
}
