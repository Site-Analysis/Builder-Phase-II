// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useState } from "react";
import { useUIStore } from "@/lib/stores/ui";

export interface CadastralLayerState {
  lgdVillages: boolean;
  encroachment: boolean;
  wrisLakes: boolean;
  powerGrid: boolean;  // EHV/HV/MV power lines (OSM)
  bescom: boolean;     // BESCOM admin zone boundaries
  gas: boolean;
  roadWidths: boolean;
  bbmpSwd: boolean;
  bwssb300: boolean;
  bwssb150: boolean;
  bwssbMinor: boolean;
  amenities: boolean;
  transportAccess: boolean;
}

export const DEFAULT_LAYER_STATE: CadastralLayerState = {
  lgdVillages: false, encroachment: false, wrisLakes: false,
  powerGrid: false, bescom: false, gas: false,
  roadWidths: false, bbmpSwd: false,
  bwssb300: false, bwssb150: false, bwssbMinor: false,
  amenities: false,
  transportAccess: false,
};

interface Props {
  layerState: CadastralLayerState;
  onToggle: (layer: keyof CadastralLayerState) => void;
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 18, height: 5,
      background: dashed ? "transparent" : color,
      border: dashed ? `2px dashed ${color}` : "none",
      borderRadius: 2, verticalAlign: "middle", marginRight: 3,
    }} />
  );
}
function Box({ color, opacity = 0.7 }: { color: string; opacity?: number }) {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10,
      background: color, opacity, borderRadius: 2, verticalAlign: "middle", marginRight: 3,
    }} />
  );
}

function Row({
  label, checked, onToggle, legend,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  legend?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "#3A3F3B" }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ cursor: "pointer", accentColor: "#306223" }} />
        {label}
      </label>
      {legend && <div style={{ paddingLeft: 20, fontSize: 10, color: "#7B8F83", lineHeight: "1.7" }}>{legend}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#7B8F83", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

export function CadastralLayersPanel({ layerState, onToggle }: Props) {
  const [open, setOpen] = useState(true);
  const { powerGridEnabled, setPowerGridEnabled } = useUIStore();

  return (
    <div style={{
      position: "fixed", top: 104, right: 10, zIndex: 1150,
      background: "rgba(253,252,251,0.55)",
      backdropFilter: "blur(14px) saturate(160%)",
      WebkitBackdropFilter: "blur(14px) saturate(160%)",
      borderRadius: 12, width: 230,
      border: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 12px", cursor: "pointer",
          borderBottom: open ? "1px solid rgba(207,214,196,0.45)" : "none",
          borderRadius: open ? "12px 12px 0 0" : 12,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 13, color: "#306223" }}>Layers</span>
        <span style={{ color: "#7B8F83", transform: open ? "" : "rotate(180deg)", transition: "transform 0.2s", fontSize: 10 }}>▲</span>
      </div>

      {open && (
        <div style={{ padding: "10px 12px" }}>

          <Section title="Cadastral">
            <Row label="LGD Villages" checked={layerState.lgdVillages} onToggle={() => onToggle("lgdVillages")}
              legend={<><Box color="#4caf50" /> covered &nbsp;<Box color="#ef5350" /> missing</>}
            />
            <Row label="Encroachment" checked={layerState.encroachment} onToggle={() => onToggle("encroachment")}
              legend={<><Box color="#d32f2f" /> BBMP notified &nbsp;<Box color="#f57c00" /> revenue</>}
            />
          </Section>

          <Section title="Water">
            <Row label="WRIS Lakes" checked={layerState.wrisLakes} onToggle={() => onToggle("wrisLakes")} />
          </Section>

          <Section title="Infrastructure">
            <Row label="Power Grid" checked={powerGridEnabled} onToggle={() => setPowerGridEnabled(!powerGridEnabled)}
              legend={<>
                <Swatch color="#e74c3c" /> 400kV &nbsp;
                <Swatch color="#e91e63" /> 220kV &nbsp;
                <Swatch color="#ff9800" /> 132kV
                <br />
                <Swatch color="#ffc107" /> 66kV &nbsp;
                <Swatch color="#8bc34a" /> 33kV &nbsp;
                <Swatch color="#4fc3f7" /> 11kV
                <br />
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ff9800", verticalAlign: "middle", marginRight: 3 }} />substations &nbsp;
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", verticalAlign: "middle", marginRight: 3 }} />plants
              </>}
            />
            <Row label="BESCOM Zones" checked={layerState.bescom} onToggle={() => onToggle("bescom")}
              legend={<><Swatch color="#37474f" dashed /> admin zone boundaries</>}
            />
            <Row label="Gas Pipelines" checked={layerState.gas} onToggle={() => onToggle("gas")}
              legend={<>
                <Swatch color="#f57c00" /> confirmed &nbsp;
                <Swatch color="#ff8f00" dashed /> probable
              </>}
            />
            <Row label="Road Widths" checked={layerState.roadWidths} onToggle={() => onToggle("roadWidths")}
              legend={<><Swatch color="#1565c0" /> BBMP &nbsp;<Swatch color="#2e7d32" /> OSM &nbsp;<Swatch color="#9e9e9e" /> est.</>}
            />
          </Section>

          <Section title="Amenities">
            <Row label="Nearby Amenities" checked={layerState.amenities} onToggle={() => onToggle("amenities")}
              legend={<>
                <Box color="#c62828" /> Health &nbsp;
                <Box color="#1565c0" /> Education &nbsp;
                <Box color="#2e7d32" /> Transport
                <br />
                <Box color="#e65100" /> Retail &nbsp;
                <Box color="#4a148c" /> Finance &nbsp;
                <Box color="#004d40" /> Recreation &nbsp;
                <Box color="#795548" /> Religious
              </>}
            />
          </Section>

          <Section title="Transport Access">
            <Row label="Highway / Metro / Rail / Airport" checked={layerState.transportAccess} onToggle={() => onToggle("transportAccess")}
              legend={<>
                <Box color="#7B1FA2" /> Metro &nbsp;
                <Box color="#B71C1C" /> Rail &nbsp;
                <Box color="#E65100" /> Highway &nbsp;
                <Box color="#0D47A1" /> Airport
              </>}
            />
          </Section>

          <Section title="Drainage">
            <Row label="BBMP Storm Drains" checked={layerState.bbmpSwd} onToggle={() => onToggle("bbmpSwd")}
              legend={<>
                <Swatch color="#004d40" /> primary &nbsp;
                <Swatch color="#00695c" /> secondary &nbsp;
                <Swatch color="#00897b" /> tertiary
              </>}
            />
            <div style={{ marginBottom: 2 }}>
              <div style={{ fontSize: 12, marginBottom: 3, color: "#3A3F3B" }}>BWSSB Sewerage</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "#3A3F3B" }}>
                  <input type="checkbox" checked={layerState.bwssb300} onChange={() => onToggle("bwssb300")} style={{ accentColor: "#306223" }} />
                  <Swatch color="#6a1b9a" /> 300mm+
                </label>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "#3A3F3B" }}>
                  <input type="checkbox" checked={layerState.bwssb150} onChange={() => onToggle("bwssb150")} style={{ accentColor: "#306223" }} />
                  <Swatch color="#ab47bc" /> 150–300
                </label>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "#3A3F3B" }}>
                  <input type="checkbox" checked={layerState.bwssbMinor} onChange={() => onToggle("bwssbMinor")} style={{ accentColor: "#306223" }} />
                  <Swatch color="#ce93d8" /> &lt;150mm
                </label>
              </div>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
