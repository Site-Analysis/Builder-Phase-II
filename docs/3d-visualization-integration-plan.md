# 3D Visualization — Integration Build Plan

Integrating the V3 3D simulation engine into the SAT monorepo.

**Source FVDs:** [`SAT-11_3d-simulation-engine.md`](feature-validation/SAT-11_3d-simulation-engine.md) (3D engine) · [`SAT-10_terrain-analysis.md`](feature-validation/SAT-10_terrain-analysis.md) (terrain backend)
**Source repo:** `Site-Analysis/SiteAnalysisToolV3` — `frontend/src/simulation/` + `backend/Terrain/`
**Plan owner:** Tanmay · **Drafted:** 2026-06-13

---

## Scope decisions (approved 2026-06-13)

| Decision | Choice |
|---|---|
| Scope | **SAT-11 (3D engine) + SAT-10 (terrain service)** — both, as separate PRs in one effort |
| Site selection | **Keep the V3 Mapbox rectangle-draw flow** (`SiteCreationFlow`), not SAT's pin-drop |
| Known gaps | **Fix during integration** — CSG wiring, terrain-grid mutation, real analysis-API wiring, persistence |
| 3D library versions | **Upgrade to React-19-compatible** (`fiber@9`, `drei@10`, `three@0.184`) |
| Map / elevation / geocoding provider | **MapTiler** (single provider, free tier) — MapLibre GL map + MapTiler terrain-rgb-v2 + MapTiler Geocoding; backend already on MapTiler (approved 2026-06-13) |

---

## Reality check: the export was a subset

The `3d-viz-export` folder contained ~20 files; the real feature is the **full 42-file `simulation/` subtree** plus external seams. The build works from the V3 repo at `C:\Users\tanny\SiteAnalysisToolV3`, not the export.

**Files to port (the integration unit):**
- `frontend/src/simulation/**` — 42 files (scene, site-creation, sketch-detail, panels, stores, utils, workers, types)
- `frontend/src/lib/osm-fetch.ts` (718 lines, Overpass + `osmtogeojson`)
- `frontend/src/lib/export-gltf.ts`
- `frontend/src/services/geocodingService.ts` (380 lines, Ola/Mapbox/Google)
- `frontend/src/types/simulation.ts`, `frontend/src/types/modeling.ts`
- `backend/Terrain/**` (SAT-10 service: `main.py`, `terrain_utils.py`, `models.py`, `config.py`, `requirements.txt`)

---

## Dependency reconciliation (V3 → SAT)

V3 is **Vite + React 18**; SAT is **Next 16 + React 19.2.4**. Every library is pinned forward:

| Package | V3 pin | SAT target | Note |
|---|---|---|---|
| `three` | ^0.158 | **^0.184** | |
| `@react-three/fiber` | ^8.15 | **^9.6** | peer `react >=19 <19.3` — fits 19.2.4 (a 19.3 bump breaks it) |
| `@react-three/drei` | ^9.88 | **^10.7** | peer fiber ^9 |
| `three-bvh-csg` | ^0.0.18 | ^0.0.18 | |
| `three-mesh-bvh` | (transitive) | **^0.9.7** | required peer of `three-bvh-csg` + drei `Bvh` — add explicitly |
| `@types/three` | — | **^0.184** (dev) | |
| `react-map-gl` | ^8.1 | ^8.1 | **kept** — switch import to `/maplibre` subpath; verify React-19 peer |
| `maplibre-gl` | — | **^4.x (latest)** | **replaces** `mapbox-gl` (open fork, MapTiler-native) |
| `terra-draw` (+ maplibre adapter) | — | **latest** | **replaces** `@mapbox/mapbox-gl-draw` + plugins for rectangle draw on MapLibre |
| ~~`mapbox-gl`~~ | (peer) | **removed** | replaced by `maplibre-gl` |
| ~~`@mapbox/mapbox-gl-draw` + circle/rectangle plugins~~ | ^1.x | **removed** | replaced by `terra-draw` |
| `konva` | ^10.2 | ^10 | |
| `react-konva` | ^18.2 | **^19** | React-19 bump required |
| `@turf/turf` | ^7.3 | ^7 | |
| `allotment` | ^1.20 | ^1.20 | |
| `osmtogeojson` | ^3.0-beta | ^3.0-beta | |

## Porting workstreams (mechanical, Phase 1)

1. **Vite → Next env:** `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` across `geocodingService.ts`, `terrain-dem.ts`, map components.
2. **Vite → Next workers:** `context-geometry.worker.ts` — verify `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` resolves under Turbopack.
3. **SSR:** the entire scene + map must be client-only (`'use client'` + `next/dynamic` `ssr:false`), mirroring SAT's Leaflet usage.
4. **React 18 → 19:** `react-konva@19`, fiber 8→9 event/type drift, drei 9→10 prop drift.
5. **Mapbox → MapTiler/MapLibre:** swap `SiteCreationFlow.tsx` to `react-map-gl/maplibre` + `maplibre-gl` + MapTiler style (and `terra-draw` for rectangle draw); one-line tile-URL swap in `terrain-dem.ts` (decode unchanged); add `searchWithMapTiler()` in `geocodingService.ts`. Mostly mechanical — MapLibre is a mapbox-gl fork (see MapTiler Migration section).

---

## Required secrets (gitignored `.env` only)

| Key | Used by | Confirmed? |
|---|---|---|
| `MAPTILER_KEY` | SAT-10 terrain backend (DEM tiles) | ✅ user has it |
| `NEXT_PUBLIC_MAPTILER_KEY` | SAT-11 site-select map style + terrain-rgb DEM + geocoding (browser-exposed; same key value, domain-restricted) | ⚠️ **REQUIRED for SAT-11** |
| `NEXT_PUBLIC_OLA_MAPS_API_KEY` | geocoding (India-first) | optional — geocoding degrades without it |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | geocoding fallback | optional |

`.env.example` documents these; never commit real values. **One MapTiler key covers everything** (frontend + backend); restrict it by domain in the MapTiler dashboard.

---

## MapTiler Migration (replaces Mapbox)

The 3D scene **stays Three.js / R3F**. MapLibre GL + MapTiler (client-only) replace Mapbox at three seams. MapLibre is an open fork of mapbox-gl-js, so these are mostly URL/import swaps:

| # | Mapbox usage (file) | MapTiler replacement |
|---|---|---|
| 1 | Site-select 2D map — `react-map-gl/mapbox` + `mapbox-gl`, style `light-v11` (`SiteCreationFlow.tsx`) | `react-map-gl/maplibre` + `maplibre-gl`, MapTiler style URL (`https://api.maptiler.com/maps/dataviz-light/style.json?key=…`) |
| 1b | Rectangle draw — `@mapbox/mapbox-gl-draw` + rectangle/circle plugins | `terra-draw` rectangle mode (MapLibre adapter) |
| 1c | Satellite drape — `map.toDataURL()` (`SiteCreationFlow.tsx:171`) | unchanged — MapLibre canvas `toDataURL()` (init map with `preserveDrawingBuffer: true`); MapTiler Static Maps API as fallback |
| 2 | Terrain DEM — `api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw` (`terrain-dem.ts:291`) | **URL swap only** → `api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=…`. **Decode formula is identical** (`-10000 + (R·65536 + G·256 + B)·0.1`); zoom caps at 14 |
| 3 | Geocoding — `searchWithMapbox()` (`geocodingService.ts`) | `searchWithMapTiler()` → `api.maptiler.com/geocoding/{query}.json?key=…`; Ola/Google/Nominatim providers retained, Mapbox provider dropped |

**MapTiler integration notes:**
- `maplibre-gl` is client-only — load behind `next/dynamic` `ssr:false`, same as the Three.js scene; import `maplibre-gl/dist/maplibre-gl.css`.
- Backend (SAT-10) is **already** on MapTiler terrain-rgb-v2 — no backend provider change; the frontend decode now matches the backend exactly.
- Coordinate systems unchanged: MapLibre works in lng/lat; `projection.ts` equirectangular-local conversion is untouched.
- Single key: set `NEXT_PUBLIC_MAPTILER_KEY` (browser) and `MAPTILER_KEY` (server) to the same domain-restricted MapTiler key.

---

## Feature flags (default off)

- `feature.terrain.analysis` — SAT-10 terrain backend service gate
- `feature.simulation.3d` — SAT-11 3D engine route gate

Added to `packages/flags/src/flags.py` in Phase 0.

## Ports

Terrain service on **8005** (8000–8004 taken by temperature/sunpath/flood/wind/rainfall).

---

## Acceptance-criteria coverage

**SAT-11 (8 ACs):** map site select (1), OSM context (2), terrain mesh (3), proposal placement (4), live metrics (5), floor editor (6), terrain-aware placement (7), all design tools (8) — all ported from `simulation/`.

**SAT-10 (8 ACs):** slope/aspect/buildable/hazard/suitability/profile/inspect/heatmaps — all in `backend/Terrain/terrain_utils.py`, exposed via `contracts/terrain.yaml`.

## Gap-fixes (approved in scope — Phase 4)

| FVD gap | Fix |
|---|---|
| CSG ops use bounds approximation (`csg-ops.ts` unwired) | Wire `three-bvh-csg` into `useProposalStore` boolean ops |
| Terrain pad/sculpt don't mutate elevation grid | Make `TerrainPad`/`TerrainSculpt` edit the grid, not just overlay |
| Analysis panel local-only | Call SAT's sunpath/temperature/wind services after massing |
| Persistence unwired | Wire simulation project state into SAT's project/Supabase flow |

---

## Phased PR plan (one feature per PR)

| Phase | PR | Content | Gate |
|---|---|---|---|
| 0 | — | This plan + feature flags | **← awaiting approval** |
| 1 | `feat/terrain-service` | SAT-10 backend on 8005: `contracts/terrain.yaml` (contract-first) + CHANGELOG, `services/terrain/`, flag gate, smoke test, compose | approval |
| 2 | `feat/3d-foundation` | Deps + ported `simulation/` subtree + seams; Vite→Next + React-19 port; `tsc`-clean, unrouted | approval |
| 3 | `feat/3d-scene` | Mapbox site-creation flow + scene route behind flag; OSM + terrain load; SAT theming | approval |
| 4 | `feat/3d-tools` | Design tools, transform controls, Konva floor editor, live metrics | approval |
| 5 | `feat/3d-gap-fixes` | CSG, terrain mutation, analysis-API wiring, persistence | approval |
| 6 | `feat/3d-export` | GLB/GLTF export into SAT export flow; perf (Instanced/BVH); polish | approval |

---

## Top risks

1. **React 19 / Next 16 library drift** — `react-konva@19`, `react-map-gl@8` (verify React-19 peer), fiber/drei majors; the heaviest unknown.
2. **Bundle size** — `SceneCanvas.tsx` (5.3k lines) + Three.js + MapLibre + Konva; must code-split behind the flag/route. (MapLibre is far lighter than ArcGIS — this is the cheaper path.)
3. **Draw migration** — `@mapbox/mapbox-gl-draw` → `terra-draw` rectangle mode on MapLibre; small but new behavior to validate against the v3 site-selection UX.
4. **MapTiler key + free-tier limits** — one key for map+DEM+geocoding; watch free-tier request quotas at scale.
5. **Worker + SSR under Turbopack** — Vite worker/asset idioms + `maplibre-gl` client-only loading.
6. **Coordinate consistency** — `projection.ts` equirectangular origin must agree with the MapLibre map-select extent (lng/lat).
