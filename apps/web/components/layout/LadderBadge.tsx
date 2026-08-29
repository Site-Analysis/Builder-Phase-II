// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import type { LadderConfidence } from "@/lib/stores/analysis";

// US-092 Job A — the C4 confidence ladder as a visible per-signal badge. Deliberately graded so
// `inferred` reads visibly WEAKER than `authoritative`, and `unresolved` reads DISTINCT from a pass
// (grey with a dashed outline + "UNRESOLVED"), never blank or green.
const LADDER: Record<LadderConfidence, { fg: string; bg: string; label: string; dashed?: boolean }> = {
  authoritative: { fg: "#5A8F6A", bg: "#E4F0E8", label: "AUTHORITATIVE" }, // green — strongest
  derived:       { fg: "#2F7E8C", bg: "#E0EEF0", label: "DERIVED" },        // teal
  inferred:      { fg: "#C4865A", bg: "#F8EDE0", label: "INFERRED" },       // amber — weaker
  unresolved:    { fg: "#8A7B6B", bg: "#EFEAE3", label: "UNRESOLVED", dashed: true }, // grey, dashed
};

export function LadderBadge({ tier, title }: { tier: LadderConfidence; title?: string }) {
  const t = LADDER[tier];
  return (
    <span
      title={title ?? `confidence: ${t.label.toLowerCase()}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 8.5, fontWeight: 700, letterSpacing: "0.3px",
        color: t.fg, background: t.bg, borderRadius: 4, padding: "1px 6px",
        border: t.dashed ? `1px dashed ${t.fg}` : "none", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.fg, display: "inline-block", flexShrink: 0 }} />
      {t.label}
    </span>
  );
}
