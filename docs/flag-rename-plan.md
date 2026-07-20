# Flag-rename plan — `feature.geo.parcel-geometry` → `feature.geo.parcel`  (+ cadastral flag)

**Status:** PLAN ONLY — not executed. This is a coordinated **code + ops** change; run it as
its own atomic commit at commit-time, not smeared into the banked-tree split.

## Correction (the earlier "historical CHANGELOG" worry was the bug, not the work)
`contracts/CHANGELOG.md` is **monotonic / append-only**. Do **NOT** rewrite any past entry.
The rename ships as a **NEW** CHANGELOG entry recording the rename, plus the enum + live
code + contract refs + tests. Old entries keep the old name as accurate history.

## Two changes bundled
1. **Rename** parcel flag value `feature.geo.parcel-geometry` → **`feature.geo.parcel`**
   (canonical, Sprint-0 A). Also rename the enum member `GEO_PARCEL_GEOMETRY` → `GEO_PARCEL`.
2. **Add** cadastral flag `GEO_CADASTRAL_LAYER = "feature.geo.cadastral-layer"` (registry
   name; frontend still gates via `NEXT_PUBLIC_ENABLE_CADASTRAL` — divergence recorded in
   FVD SAT-21).

## Code touch-points (from `rg feature.geo.parcel-geometry|GEO_PARCEL_GEOMETRY`)
| File | Line(s) | Change |
|---|---|---|
| `packages/flags/src/flags.py` | 39 | enum member + value → `GEO_PARCEL = "feature.geo.parcel"`; add `GEO_CADASTRAL_LAYER` |
| `services/geo/app/routers/geo.py` | 31 | `_PARCEL_FLAG = "feature.geo.parcel"` |
| `contracts/geo.yaml` | 119 | description text → new flag name |
| `contracts/CHANGELOG.md` | — | **new entry** (next free version) documenting the rename; do NOT edit line 23/133 |
| `tests/geo_smoke.py` | 101, 128 | `setenv("FLAGS", "feature.geo.parcel")` |
| `tests/geo_parcel_smoke.py` | 81, 103 | `setenv("FLAGS", "feature.geo.parcel")` (and see smoke-merge in SAT-19 FVD) |
| `apps/web/lib/api/analysis.ts` | 1442 | comment → new flag name |
| `docs/feature-validation/SAT-19_...md` | 78, 95 | flag refs → new name (already noted "rename pending") |

CHANGELOG timing note: if US-080 has already **merged** under the old name → the rename is a
standalone entry (leave the merged entry as history). If US-080 is still **banked** →
fold the rename into US-080 so its `2.11.0` entry uses the canonical name from the start
(no separate entry needed). Line 133 is an older **committed** entry — leave it as history
regardless.

## Env / deploy touch-points (the "ops half" — must land in the SAME window as the code)
| Where | Var | Action |
|---|---|---|
| **Mumbai API box** (prod) | `FLAGS` | if it lists `feature.geo.parcel-geometry`, flip → `feature.geo.parcel` **at deploy** (stale name → 403 on `/geo/parcel`) |
| **Vercel** (frontend) | `NEXT_PUBLIC_ENABLE_CADASTRAL` | build-time — a rename/promo needs an **env update + redeploy/rebuild** (NEXT_PUBLIC_* is inlined at build) |
| `.env.example` | both | document `feature.geo.parcel` + cadastral gate |
| `docker-compose.yml` | `FLAGS` | update any default that carries the old name |
| `.vscode/tasks.json` | 123 | local dev `FLAGS` → new name |

## Why atomic
The service 403s if code says `feature.geo.parcel` while the box's `FLAGS` still says
`feature.geo.parcel-geometry` (or vice-versa). Code + Mumbai `FLAGS` + Vercel env must move
together.

**Deploy-ordering note — Vercel rebuild is mandatory:** `NEXT_PUBLIC_ENABLE_CADASTRAL` (and
any renamed `NEXT_PUBLIC_*` flag) is **inlined at build time**, not read at runtime. Changing
the enum/name without a **frontend rebuild + redeploy in the same window** leaves the old
value baked into the shipped bundle → the cadastral toggle **silently breaks** (renders
against a stale/absent flag with no error). Sequence: update Vercel env → **trigger a rebuild**
→ verify the toggle in preview → promote. A code-only change with no rebuild is a broken deploy.

Not executed here — this doc is the checklist for that commit-time change.
