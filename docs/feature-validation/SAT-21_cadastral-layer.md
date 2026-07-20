# FVD — SAT-21 Builders View: Cadastral Parcel Overlay

**Jira Ticket:** SAT-21 (confirm number) · Story **US-081**
**Status:** Raster overlay landed (banked, pre-commit, env-gated) · acceptance validation PENDING (KGIS egress blocked) · honest-degradation delta NOT yet built
**Type:** Story
**Target repo/branch:** fallback repo → `Builders`

---

## Feature Overview

**User Story:** As a builder/land buyer, I want the official KGIS survey-parcel grid drawn
over the satellite map, so I can see cadastral boundaries around a site that ordinary
OSM/Google basemaps cannot show.

**Business Value:** Visual cadastral context for the Builders View — pairs with the
survey-number search (US-080/SAT-19). A differentiator vs generic map tools.

**Positioning:** Indicative only — **not a legal survey** (KGIS terms forbid legal use).
Survey-to-physical offset is a known **3–10 m** (the exact measured offset is PENDING —
see Accuracy Report; never claim sub-metre).

---

## Implementation Landed

- **`CadastralLayer`** (`apps/web/components/map/MapContainer.tsx`) — lazy-imports
  `esri-leaflet` `dynamicMapLayer` (touches `window`; kept out of the SSR bundle),
  KGIS `CadastralData_Admin/Dynamic_CadastralData_Admin/MapServer` **layer 5**, opacity
  0.85, attribution "Cadastral: KGIS (KSRSAC) — indicative, not a legal survey". Server
  enforces `minScale 40000` → grid draws only when zoomed in.
- **Toggle button** (bottom-right) + `NEXT_PUBLIC_ENABLE_CADASTRAL` build-env gate; ships
  dark, enabled per-deployment.
- **Selection persistence:** the located parcel lives in a zustand store
  (`lib/stores/parcel.ts`) and renders via `ParcelOverlay` (`react-leaflet <GeoJSON>`);
  the basemap toggle swaps only the `<TileLayer>`, so **parcel selection survives the
  toggle by construction** (both overlays sit in Leaflet `overlayPane`, above tiles).
- Dependency added: `esri-leaflet ^3.0.19` + `apps/web/types/esri-leaflet.d.ts` shim.

---

## Flag

Canonical target: **`feature.geo.cadastral-layer`** (`FeatureFlag.GEO_CADASTRAL_LAYER`,
default off) — enum entry added in the Sprint-0-A flag-reconciliation change.

**Env-gate divergence (recorded per Sprint-0 A):** this is a **frontend-only** map overlay
with **no service endpoint**, so it cannot use the service `FLAGS` mechanism (services read
`os.getenv("FLAGS")`; `packages/flags` is outside the web build). The actual gate is the
build-time env **`NEXT_PUBLIC_ENABLE_CADASTRAL=1`**. The enum entry is the canonical
registry name; the env var is the real switch. Divergence is intentional and documented
here rather than forced into the service flag path.

---

## Code Traceability Matrix

| # | Acceptance Criterion | File | Symbol |
|---|---|---|---|
| 1 | KGIS cadastral grid as an ArcGIS dynamic overlay (layer 5) | `apps/web/components/map/MapContainer.tsx` | `CadastralLayer` |
| 2 | Lazy `esri-leaflet` import (no SSR `window` access) | `apps/web/components/map/MapContainer.tsx` | dynamic `import("esri-leaflet")` |
| 3 | Toggle + per-deployment env gate | `apps/web/components/map/MapContainer.tsx` | `cadastralEnabled` / `cadastral` state |
| 4 | Selection survives basemap toggle | `lib/stores/parcel.ts` + `components/map/ParcelOverlay.tsx` | `useParcelStore` / `ParcelOverlay` |
| 5 | Indicative-not-legal attribution | `apps/web/components/map/MapContainer.tsx` | layer `attribution` |

---

## Accuracy Report

- **Golden set:** N ≥ 10 parcels (≈ 6 CORE BBMP/BDA + 4 OUTSKIRT/BMRDA) cross-checked
  against **Dishaank** survey numbers — **PENDING**. Blocked on whitelisted KGIS access
  (see `docs/phase-0-kgis-verification.md`, probe **P3**).
- **Measured survey-to-physical offset:** **PENDING LIVE VERIFICATION — KGIS egress blocked**
  (overlay vs MapTiler satellite at the golden parcels; report the measured **range** in
  metres, never sub-metre — NOT validated, do not claim an offset yet).
- **Coverage-gap map:** which BMRDA/outskirt areas return empty tiles — **PENDING** (P3).
- **Known limitations (must fix before commercial enable):**
  1. **Coverage-vs-not-found messaging NOT built.** The raster overlay renders blank where
     KGIS has no data — currently **indistinguishable from "no parcel here"**. This
     violates **Accuracy Contract C** until the honest-degradation delta lands
     (coverage probe → distinct "no cadastral coverage at this location" banner; BMRDA
     fallback = user-drawn polygon + Bhoomi RTC area cross-check + Dishaank deep-link, all
     marked `inferred`).
  2. **BMRDA/outskirt coverage unproven** — must not be presented as authoritative.
  3. **Offset unmeasured** — 3–10 m is the KGIS-terms range, not an independent measurement.
- **Next:** ship the honest-degradation delta, then fill offset + Dishaank numbers here.

---

## Smoke

US-081 is a **frontend-only** map overlay — it ships **no backend smoke test** (no service
endpoint). The parcel-search backend smoke and its duplicate-smoke overlap (US-080) are
enumerated in **SAT-19**. Frontend behaviour (toggle, selection persistence, coverage
messaging) is covered by the acceptance validation above — pending KGIS access.

## Security note

Read-only public KGIS ArcGIS tiles; no credentials. Non-commercial spike use only — no
commercial flag-enable before the KGIS data-sharing license is signed.
