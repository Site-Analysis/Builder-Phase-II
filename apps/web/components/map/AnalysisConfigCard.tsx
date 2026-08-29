// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useConfigStore } from "@/lib/stores/config";

const GLASS: React.CSSProperties = {
  background: "rgba(253,252,251,0.55)",
  backdropFilter: "blur(16px) saturate(160%)",
  WebkitBackdropFilter: "blur(16px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.6)",
  borderRadius: 14,
  boxShadow: "0 8px 30px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
  overflow: "hidden",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#7B8F83",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#9BA8A0",
  marginTop: 4,
};

const dateInput: React.CSSProperties = {
  width: "100%",
  height: 30,
  border: "1.5px solid #CFD6C4",
  borderRadius: 7,
  padding: "0 8px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#3A3F3B",
  background: "#F2EDE8",
  outline: "none",
  boxSizing: "border-box",
};

export function AnalysisConfigCard() {
  const { bufferM, startDate, endDate, setConfig } = useConfigStore();
  const bufferKm = bufferM / 1000;

  return (
    <div style={GLASS}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(207,214,196,0.5)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3A3F3B" }}>Analysis config</div>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Buffer radius */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Buffer radius</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3A3F3B" }}>{bufferKm.toFixed(1)} km</span>
          </div>
          <input
            type="range" min={0.1} max={5} step={0.1} value={bufferKm}
            onChange={(e) => setConfig({ bufferM: parseFloat(e.target.value) * 1000 })}
            style={{ width: "100%", accentColor: "#306223", cursor: "pointer", margin: "2px 0" }}
          />
          <span style={hintStyle}>flood · wind · site circle · 0.1–5 km</span>
        </div>

        {/* Analysis period */}
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Analysis period</div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9BA8A0", marginBottom: 2 }}>From</div>
              <input
                type="date" value={startDate} max={endDate}
                onChange={(e) => setConfig({ startDate: e.target.value })}
                style={{ ...dateInput, height: 26, fontSize: 11 }}
                onFocus={(e) => { e.target.style.borderColor = "#99CDD8"; e.target.style.background = "#FDFCFB"; }}
                onBlur={(e)  => { e.target.style.borderColor = "#CFD6C4"; e.target.style.background = "#F2EDE8"; }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#9BA8A0", marginBottom: 2 }}>To</div>
              <input
                type="date" value={endDate} min={startDate}
                onChange={(e) => setConfig({ endDate: e.target.value })}
                style={{ ...dateInput, height: 26, fontSize: 11 }}
                onFocus={(e) => { e.target.style.borderColor = "#99CDD8"; e.target.style.background = "#FDFCFB"; }}
                onBlur={(e)  => { e.target.style.borderColor = "#CFD6C4"; e.target.style.background = "#F2EDE8"; }}
              />
            </div>
          </div>
          <span style={hintStyle}>rainfall · temperature year</span>
        </div>

      </div>
    </div>
  );
}
