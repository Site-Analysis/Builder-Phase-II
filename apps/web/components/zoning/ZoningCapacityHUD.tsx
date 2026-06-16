"use client";

import type { ModuleResult } from "@/lib/stores/analysis";
import { Z, fmtDist } from "./theme";
import { HudCard, type HudCorner } from "./HudCard";
import { FarGauge } from "./FarGauge";
import { BuildableDonut } from "./BuildableDonut";
import { HeightEnvelopeBar } from "./HeightEnvelopeBar";
import { SetbackPlanDiagram } from "./SetbackPlanDiagram";
import { SiteContextRadar } from "./SiteContextRadar";

interface ZoningCapacityHUDProps {
  result: ModuleResult;
  variant?: "compact" | "full";
  corner?: HudCorner;
}

// Bottom-right HUD: development envelope — FAR, footprint, height, setbacks,
// and the site-context radar. Compact shows the gauge + headline stats only.
export function ZoningCapacityHUD({ result, variant = "full", corner = "br" }: ZoningCapacityHUDProps) {
  const z = result.zoning;
  if (!z) return null;
  const full = variant === "full";

  return (
    <HudCard
      title="Development Capacity"
      subtitle={`${z.airportName} · ${z.airportDistanceKm.toFixed(1)} km`}
      corner={corner}
      width={full ? 304 : 220}
      maxHeight={full ? "calc(50% - 20px)" : undefined}
      footer={full ? `Airport OLS: ${z.airportSurface}${z.metroName ? ` · Metro: ${z.metroName} (${fmtDist(z.metroDistanceM ?? 0)})` : ""}` : undefined}
    >
      {!z.zoneIsBuildable && (
        <div style={{
          background: Z.warnBg, border: `1px solid ${Z.warn}`, borderRadius: 6,
          padding: "6px 8px", marginBottom: 10,
          fontSize: 8.5, color: Z.warn, fontWeight: 600, lineHeight: 1.4,
        }}>
          ⚠ {z.zoneClass} — not buildable as zoned. Figures below are <b>post-conversion potential</b> (Residential baseline), subject to land-use change + BDA/BBMP approval.
        </div>
      )}
      {full ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* row 1 — gauge + donut */}
          <div style={{ display: "flex", justifyContent: "space-around", gap: 6 }}>
            <FarGauge farApplicable={z.farApplicable} baseFar={z.baseFar} todApplicable={z.todApplicable} todFarMax={z.todFarMax} />
            <BuildableDonut plotAreaSqm={z.plotAreaSqm} groundCoverageMax={z.groundCoverageMax} buildableAreaSqm={z.buildableAreaSqm} />
          </div>
          <Divider />
          {/* row 2 — height + setback plan */}
          <div style={{ display: "flex", justifyContent: "space-around", gap: 6, alignItems: "flex-start" }}>
            <HeightEnvelopeBar maxHeightM={z.maxHeightM} heightLimitingFactor={z.heightLimitingFactor} olsHeightM={z.olsHeightM} />
            <SetbackPlanDiagram front={z.setbackFrontM} rear={z.setbackRearM} side={z.setbackSideM} plotAreaSqm={z.plotAreaSqm} />
          </div>
          {z.context.length > 0 && (
            <>
              <Divider />
              <div style={{ display: "flex", justifyContent: "center" }}>
                <SiteContextRadar items={z.context} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FarGauge farApplicable={z.farApplicable} baseFar={z.baseFar} todApplicable={z.todApplicable} todFarMax={z.todFarMax} size={96} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Stat label="Buildable" value={`${Math.round(z.buildableAreaSqm).toLocaleString()} sqm`} />
            <Stat label="Max height" value={`${z.maxHeightM} m`} />
            <Stat label="Coverage" value={`${Math.round(z.groundCoverageMax * 100)}%`} />
          </div>
        </div>
      )}
    </HudCard>
  );
}

function Divider() {
  return <div style={{ height: 1, background: Z.border, opacity: 0.7 }} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: Z.inkSoft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
      <div style={{ fontSize: 13, color: Z.ink, fontWeight: 700, fontFamily: "var(--font-geist-mono), monospace" }}>{value}</div>
    </div>
  );
}
