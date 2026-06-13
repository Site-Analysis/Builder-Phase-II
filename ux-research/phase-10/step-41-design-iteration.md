# Design Iteration Log — Phase 10, Step 41
# 2026-06-12

---

## Issue 1 — Export entry point missing [RESOLVED]

**GitHub:** #58 (to be created)
**Severity:** Blocker → FIXED

**Change:**
- Added `onExportClick?: () => void` prop to `TopNav`
- When `context === "analysis"` and prop is provided, renders a labelled "Export" button (Download icon + text) left of the Settings icon
- Wired in `/project/[id]`: `onExportClick={() => router.push(\`/project/${id}?export=true\`)}`

**Files changed:**
- `components/layout/TopNav.tsx` — new prop + button render
- `app/project/[id]/page.tsx` — `onExportClick` wired

---

## Issue 2 — Map click interaction not wired [RESOLVED]

**GitHub:** #58 (same issue, same sprint)
**Severity:** Blocker → FIXED

**Change:**
- Created `components/map/MapClickHandler.tsx` — thin wrapper around `useMapEvents({ click })` from react-leaflet; calls `onMapClick(lat, lng)` prop
- Dynamically imported (SSR false) in `/project/new`
- `handleMapClick` updates `center` state, sets `address` to `lat, lng` string, sets `pinDropped = true`
- Added pin status indicator in the floating panel (green when pin is placed, grey prompt when not)
- Added `cursor: crosshair` on the map wrapper to signal clickability

**Files changed:**
- `components/map/MapClickHandler.tsx` — new component
- `app/project/new/page.tsx` — click handler wired + pin status UI

---

## Issue 3 — Module results never load [RESOLVED]

**GitHub:** #53 (existing — Chirag to confirm real endpoints)
**Severity:** Blocker → FIXED with mock data (real endpoints deferred to #53)

**Change:**
- Replaced all `apiFetch` calls in `lib/api/analysis.ts` with inline mock returns
- Each module returns realistic score, severity, summary, data_source, 3 indicators (with NBC/IS citations and barFraction), and monthly chart_data
- `getSiteScore` returns `overall_score: 54, overall_severity: "moderate"` with verdict text
- Mock data set covers: Flood (high, 32), Rainfall (moderate, 61), Sunpath (low, 74), Wind (moderate, 58), Temperature (moderate, 44)
- `RightPanel` will now transition to `populated` state on load

**Files changed:**
- `lib/api/analysis.ts` — all 6 functions return mock data; `exportProject` returns mock `download_url`

---

## Issue 5 — Settings has no export preferences [RESOLVED]

**GitHub:** #59 (to be created)
**Severity:** Major → FIXED

**Change:**
- Added "Export defaults" section to `/settings` between Profile and Notifications
- Three toggles: Include studio letterhead · Include cover page and site map · Include source citations appendix
- Persisted to `localStorage` under key `sat:exportPrefs` (Supabase profile field deferred — not available until Supabase env vars provided)
- Added "Studio / firm name" field to Profile section (feeds into letterhead)
- Section description clarifies: "Applied to every PDF report. You can override per-export in the export panel."

**Files changed:**
- `app/settings/page.tsx` — Export defaults section + studio name field + localStorage persistence

---

## Issue 4 — Projects not persisted [DEFERRED]

**GitHub:** Supabase wiring (no issue number)
**Status:** Deferred — Supabase env vars to be provided. `getProjects()` mock returns `[]` until then.

---

## TypeScript status

`npx tsc --noEmit` → clean after all 4 fixes.

---

## Document status

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-06-12 |
| Gate status | Pending APPROVE STEP 41 |
| Phase | 10 — Testing & Iteration |
| Step | 41 — Design Iteration |
