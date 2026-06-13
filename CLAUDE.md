# CLAUDE.md

Guidance for Claude Code working in the SAT monorepo.

## Repo Purpose

Canonical, deployable build of the Site Analysis Tool. Heavy features are migrated here one at a time from `/Volumes/LocalDrive/Site Analysis/` (review/cleanup workspace) after passing FVD validation. **No feature code lands without a contract, a flag, and a smoke test.**

## Repo State

- Public GitHub repo: `Site-Analysis/SAT`
- Main branch protected: 1 review + CI required, no direct push
- All changes via feature branch + PR
- `.claude/` is **partially** committed — team-shared agents/skills/commands/`settings.json` ARE in git; only `.claude/mcp.json` and `.claude/settings.local.json` are gitignored (they hold per-developer credentials). See § Claude Tooling for the full split.

---

## Layout

```
apps/web/              Next.js 16 + React 19 frontend (port 3000)
services/              FastAPI backends (one per analysis type)
  temperature/         port 8000 — thermal profile (IMD + Open-Meteo)
  sunpath/             port 8001 — solar / sun path (pvlib)
  flood/               port 8002 — flood risk (GEE + MERIT/ALOS)
  wind/                port 8003 — wind climatology
  geo/                 port 8004 — base geo / vegetation / admin boundaries
packages/flags/        Shared feature flag enum + helper
contracts/             OpenAPI YAML — one per service + CHANGELOG.md
migrations/            DB migrations + rollback notes
infra/                 Deployment assets
docs/                  Architecture + feature-validation/ FVDs
scripts/               Tooling automation
tests/                 Cross-service smoke tests
```

---

## Non-Negotiable Rules

1. **Contract-first.** Update `contracts/<service>.yaml` and `contracts/CHANGELOG.md` BEFORE writing service code. CI gate fails the PR otherwise.
2. **Flag-default-off.** Every new behavior gated by a `FeatureFlag` enum value in `packages/flags/src/flags.py`. Enable via `FLAGS=` env var only after validation.
3. **One feature per PR.** Tooling/refactor exceptions allowed but rare. PRs touching `contracts/` must update `contracts/CHANGELOG.md` (CI enforced).
4. **No direct push to main.** Branch + PR + 1 review + green CI.
5. **No secrets in committed files.** `.env`, `.claude/mcp.json`, and `.claude/settings.local.json` are gitignored. Never paste tokens, API keys, service-account JSON, or personal emails into any tracked file. Use `.env.example` for documentation and reference env vars in code/docs.
6. **FVD before code.** New feature requires `docs/feature-validation/SAT-XX_*.md` first. Acceptance criteria → code traceability is the contract for migration.

See `docs/integration-rules.md` for the canonical statement.

---

## Dev Workflow

### Frontend
```bash
cd apps/web
npm install              # first time
npm run dev              # http://localhost:3000
npm run build
```

Note: Next.js 16 has breaking changes. Read `apps/web/AGENTS.md` and `node_modules/next/dist/docs/` before writing component code.

### Services (per service)
Each service gets its own `.venv/`. **Use `python3.12`** — 3.14 is missing wheels for earthengine-api, pvlib, imdlib, netCDF4:
```bash
cd services/<service>
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port <port>
```

### Full stack via Docker
```bash
docker-compose up        # all services + web
```

### Lint + format
```bash
ruff check services/ packages/flags/src/flags.py
ruff format services/ packages/flags/src/flags.py
cd apps/web && npm run lint
```

Pre-commit hook (auto-runs ruff on staged Python files):
```bash
pip install pre-commit
pre-commit install       # once per clone
```

### Tests
```bash
pytest tests/            # cross-service smoke
pytest services/<service>/tests/   # service-level
```

---

## Feature Migration Workflow

Source: `/Volumes/LocalDrive/Site Analysis/` (review workspace, separate dir)
Target: `services/<service>/`

For each feature:
1. Confirm FVD exists at `docs/feature-validation/SAT-XX_*.md` with all ACs mapped to commits/functions
2. Review source code in Site Analysis workspace; fix issues there first
3. Update `contracts/<service>.yaml` + `contracts/CHANGELOG.md`
4. Add `FeatureFlag` enum entry, default off
5. Copy cleaned source: `Site-Analysis-Tool/src/Backend/<Service>/app/` → `services/<service>/app/`
6. Add `requirements.txt`, `pyproject.toml`, `Dockerfile`
7. Add service block to `docker-compose.yml`
8. Add smoke test: `tests/<service>_smoke.py`
9. Wire frontend in `apps/web/` behind same flag
10. Open PR `feat/<service>-service` → review → CI → merge
11. Enable flag in production `.env` only after manual validation

Use the `feature-migrator` agent (in `.claude/agents/`) to drive this end-to-end.

---

## Feature Flags

```python
# packages/flags/src/flags.py
class FeatureFlag(StrEnum):
    TEMPERATURE_THERMAL_PROFILE = "feature.temperature.thermal-profile"
    FLOOD_RISK_ANALYSIS = "feature.flood.risk-analysis"
    SUNPATH_DIAGRAM = "feature.sunpath.diagram"
    WIND_ANALYSIS = "feature.wind.analysis"
    RAINFALL_ARCHIVE = "feature.rainfall.archive"
    RAINFALL_SUMMARY = "feature.rainfall.summary"
```

Enable via env var:
```bash
FLAGS=feature.temperature.thermal-profile,feature.sunpath.diagram
```

Add new flag to enum BEFORE first commit that depends on it.

---

## External Services

| Service | Used by | Setup |
|---|---|---|
| Google Earth Engine | flood, geo (vegetation, NDVI) | Service account JSON at `gee-sa.json` — copy from `/Volumes/LocalDrive/Site Analysis/Site-Analysis-Tool/gee-sa.json` |
| Open-Meteo | temperature, wind | Public, no key |
| IMD gridded data | temperature | Local files at `services/temperature/data/` |
| pvlib | sunpath | pip install only |
| Supabase | apps/web (auth, project persistence) | URL + anon key in `.env`, get from Supabase dashboard |

---

## Jira Access (MCP Broken)

**Atlassian plugin is installed and OAuth-authenticated** — use `mcp__plugin_atlassian_atlassian__*` MCP tools directly.
Cloud ID: `f53059b9-cd1d-4106-abf6-848d8e9069da`

API gotchas discovered in practice:
- **Sprint creation** requires board-level OAuth scope (not in current token) — create sprints via Jira UI board, then assign issues via API
- **`story_points` field** is not on the default create screen — do NOT pass in `additional_fields`; set via Jira UI after creation
- **Chirag's account ID**: `712020:99b3330a-a7a6-4ea9-ace5-e80e0e3e334e`

`jira-mcp` npm package (deprecated) returns HTTP 410 Gone. **Fallback** if plugin disconnects — call REST API v3 directly via Python urllib. Read credentials from env vars, never hardcode:
```bash
export ATLASSIAN_EMAIL="<your-atlassian-email>"
export ATLASSIAN_API_TOKEN="<your-token>"   # https://id.atlassian.com/manage-profile/security/api-tokens
export ATLASSIAN_BASE_URL="https://<your-workspace>.atlassian.net"
```
```python
import os, urllib.request, base64, json

email = os.environ["ATLASSIAN_EMAIL"]
token = os.environ["ATLASSIAN_API_TOKEN"]
base  = os.environ["ATLASSIAN_BASE_URL"]

creds = base64.b64encode(f"{email}:{token}".encode()).decode()
req = urllib.request.Request(
    f"{base}/rest/api/3/search/jql",
    data=json.dumps({"jql": "project=SAT AND status=Done", "maxResults": 100}).encode(),
    headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
)
data = json.loads(urllib.request.urlopen(req).read())
```

Do **not** paste a token into any tracked file. `.claude/mcp.json` (gitignored) is the only acceptable place to persist it for MCP use.

---

## Claude Tooling

This repo is fully wired for Claude Code. Most context lives in this file (`CLAUDE.md` at repo root). Agents, skills, and slash commands are in `.claude/`.

### Committed (team-shared)
- `.claude/agents/feature-migrator.md` — migrates one feature end-to-end from review workspace → SAT
- `.claude/agents/contract-validator.md` — validates OpenAPI YAML against FastAPI route signatures
- `.claude/agents/sat-ux-designer.md` — UX/UI component design + heuristic review (model: sonnet)
- `.claude/agents/sat-ux-workflow.md` — 10-phase gated UX research → production code pipeline (model: sonnet)
- `.claude/agents/sat-copywriter.md` — marketing copy, brand voice, buyer personas (model: sonnet)
- `.claude/agents/sat-tech-copywriter.md` — technical docs, API docs, Diataxis framework (model: sonnet)
- `.claude/ux-workflow/` — phase skill files (rules, context, 10 phases) for sat-ux-workflow agent
  - `context/phase-1-findings.md` — **Phase 1 complete (2026-06-10)**: confirmed tool landscape, pain points, verbatim quotes, dashboard desires. Load this before Phase 2.
  - `context/sat-domain.md` — SAT modules, Indian regulatory refs, confirmed user personas (P01–P05)
  - `context/aec-principles.md` — map-first, density-over-whitespace, colour-encodes-meaning laws
  - `context/stack.md` — Next.js 16 / FastAPI stack constraints for design decisions
- `.claude/copy-workflow/` — 6-phase copy pipeline (brief → audit → messaging → copy → review → handoff)
- `.claude/tech-copy-workflow/` — 7-phase tech-copy pipeline with Diataxis, error P+C+S, SME gates
- `.claude/commands/security-review.md` — Anthropic's `/security-review` (run before merging any PR)
- `.claude/skills/migrate-feature/` — `/migrate-feature <service>` skill, orchestrates the migration agents
- `.claude/skills/` — UI/UX design skills (brand-guidelines, canvas-design, frontend-design, react-patterns, responsive-design, ui-component-patterns, ui-styling, web-accessibility, etc.)
- `.claude/settings.json` — team plugin marketplace config

### Local-only (gitignored — copy from Site Analysis workspace)
- `.claude/mcp.json` — GitHub MCP server only (jira-mcp removed — confirmed HTTP 410; use Atlassian plugin for Jira instead)
- `.claude/settings.local.json` — per-developer permission overrides

### Recommended plugins (install once per developer)
Run these in a Claude Code session to install to your user scope:

```
/plugin install atlassian@claude-plugins-official        # Jira/Confluence (replaces broken jira-mcp)
/plugin install supabase@claude-plugins-official         # apps/web auth + DB
/plugin install commit-commands@claude-plugins-official  # standardized git workflow
/plugin install pr-review-toolkit@claude-plugins-official # multi-agent PR review
/plugin install typescript-lsp@claude-plugins-official   # TS code intelligence (Next.js)
/plugin install pyright-lsp@claude-plugins-official      # Python type checking (services)
```

After install: `/reload-plugins`.

### Global skills
- `graphify` (`~/.claude/skills/graphify/`) — `/graphify <path>` builds knowledge graphs

### First-time setup checklist (new clone)
1. Create `.claude/mcp.json` fresh — **do NOT copy from Site Analysis workspace** (its mcp.json has a stale jira entry that will 410). Only github server goes here; see the github block already in SAT's mcp.json as reference.
2. `cp /Volumes/LocalDrive/Site\ Analysis/.claude/settings.local.json /Volumes/LocalDrive/SAT/.claude/settings.local.json`
3. `cp /Volumes/LocalDrive/Site\ Analysis/Site-Analysis-Tool/gee-sa.json /Volumes/LocalDrive/SAT/gee-sa.json`
4. `cp .env.example .env` then fill Supabase keys
5. `npm install` (root) — installs workspaces
6. `pip install pre-commit && pre-commit install` (root)
7. Open Claude Code in this dir, run the `/plugin install` commands above

---

## UX Research Status

**Phase 8 — COMPLETE (2026-06-12)** | Branch: `ux/phase-1-research`

| Phase | Status | Gate |
|-------|--------|------|
| Phase 1 — Research & Interviews (Steps 1–6) | ✅ COMPLETE | APPROVE PHASE 1 — Chirag, 2026-06-10 |
| Phase 2 — Synthesis & Analysis (Steps 7–10) | ✅ COMPLETE | APPROVE PHASE 2 — Tanmay, 2026-06-11 |
| Phase 3 — Personas, Journeys & Requirements (Steps 11–14) | ✅ COMPLETE | APPROVE PHASE 3 — Tanmay, 2026-06-11 |
| Phase 4 — Design Foundation (Steps 15–18) | ✅ COMPLETE | APPROVE PHASE 4 — Tanmay, 2026-06-11 |
| Phase 5 — IA & User Flows (Steps 19–21) | ✅ COMPLETE | APPROVE PHASE 5 — Tanmay, 2026-06-11 |
| Phase 6 — Wireframing (Steps 22–25) | ✅ COMPLETE | APPROVE PHASE 6 — Tanmay, 2026-06-11 |
| Phase 7 — UI Finalisation (Steps 26–29) | ✅ COMPLETE | APPROVE PHASE 7 — Tanmay, 2026-06-11 |
| Phase 8 — Handoff (Steps 30–33) | ✅ COMPLETE | APPROVE PHASE 8 — Tanmay, 2026-06-12 |
| Phase 9 — Code Generation (Steps 34–37) | ✅ COMPLETE | APPROVE PHASE 9 — Tanmay, 2026-06-12 |
| Phase 10 — Testing & Iteration (Steps 39–42) | ✅ COMPLETE | APPROVE PHASE 10 — Tanmay, 2026-06-12 — GO |

**Phase 3 outputs:**
- 3 personas approved (SME: Ranjitha, 2026-06-10/11): Student, Junior/Mid Architect, Senior Architect
- Journey maps: current-state + SAT-assisted for all 3 personas
- 19 functional requirements derived from research — GitHub Issues #26–#44
- MoSCoW: 6 Must-have · 7 Should-have · 3 Could-have · 3 Won't-have Beta
- Key blocked items: REQ-03 (citations), REQ-05 (AI), REQ-10 (topography), REQ-11/17 (DCR)
- Artifacts: `.claude/ux-workflow/context/phase-3-personas.md`, `phase-3-journeys.md`

**SME corrections applied (Ranjitha, 2026-06-11):**
- Persona 3: senior architects visit site personally — delegation assumption corrected
- REQ-08: broadened from Revit-only to universal AEC export (IFC + DWG + LandXML)
- REQ-14: specific visual outputs mandated (wind rose, sun-path diagram, drainage map + NBC cross-reference)
- REQ-17: legal citation chain mandated (clause numbers, source text, master plan table refs)
- Journey maps: preparation tools (AutoCAD/Revit/SketchUp) distinguished from representation tools (Photoshop/Procreate/Canva/PowerPoint/InDesign)

**Phase 4 outputs (COMPLETE — 2026-06-11):**
- Design tokens: 47 variables in Figma (29 via Tokens Studio + 18 color via manual/API)
- Figma file: SAT-UX (`m2JFe65NnDEOcvN1U5AL5C`) — 9 pages, variables, component library
- Component library: 14 components (6 atoms, 4 map-specific, 4 layout shells) — icon library: Lucide
- Figma MCP: connected and test-read successful
- Artifacts: `SAT_Phase4_Step15_DesignTokens.docx`, `SAT_Phase4_Step17_ComponentLibrary.docx`

**Phase 6 outputs (COMPLETE — 2026-06-11):**
- Lo-fi HTML wireframes: all 11 Beta screens — `wireframes/01-login.html` through `wireframes/11-settings.html`
- Mid-fi HTML wireframes: same screens with full token colours + layout
- Hi-fi HTML mockups approved for 7 screens — variant decisions recorded below
- SME Word doc: `Phase 6 - Wireframing.docx` (severity labels, score thresholds, NBC cross-refs)
- Design push: Step 25 via claude design (separate terminal) — confirmed
- Hi-fi variant approvals: Login C · Dashboard B · New Analysis A · Main Analysis B · Flood Panel B · Export B · Settings A+B toggle

**Phase 7 outputs (COMPLETE — 2026-06-11):**
- Step 26: Consistency audit across all 7 hi-fi files — identified 3 failing files
- Step 27: Delta audit fixes — all 7 files PASS (25 CSS custom properties, zero raw hex outside `:root`)
- Step 28: Clickable prototype — 3 flows wired (New Analysis · Return to Saved · Export/Share)
- Step 29: Design Freeze — `Design Freeze.docx` + GitHub Issue #52 (`Design Freeze — 2026-06-11 — Beta Frontend`)
- Token debt noted: `--color-brand-secondary-tint` has two values across files — consolidate before production token export
- Full token schema: `Implemented Schema.docx` (24 CSS custom properties, colour swatches, `:root` block)

**Phase 8 outputs (COMPLETE — 2026-06-12):**
- Step 30: Token map (25 CSS vars → Tailwind keys) + Component Registry (14 components)
- Step 31: Full TypeScript props interfaces, visual states, a11y specs for all 14 components
- Step 32: Screen implementation notes (data deps, state management, screen states, responsive) for all 7 screens
- Step 33: Dev Handoff document — `.claude/skills/canvas-design/SAT_Dev_Handoff_Phase8.png` (via claude design, not Figma)
- Token debt resolved: `--color-brand-secondary-tint` → `#EAF2F1` (canonical, 10% tint of `#2E7D6F`)
- GitHub Issues: #53 (BE endpoints), #54 (export format), #55 (geo boundary), #56 (animation), #57 (Phase 8 complete tracking)
- Phase 9 blockers: #53 and #54 must close before `/project/[id]` + export screens can be coded

**Phase 9 outputs (COMPLETE — 2026-06-12):**
- Step 34: Dependencies installed — zustand, recharts, react-leaflet, leaflet, @supabase/supabase-js, cva, clsx, tailwind-merge, lucide-react
- Step 34: `globals.css` — full `@theme {}` block (25 CSS custom properties, Tailwind v4 CSS-first)
- Step 34: `lib/utils.ts` (cn), `lib/stores/auth.ts`, `lib/stores/project.ts`, `lib/stores/analysis.ts`, `lib/api/client.ts`, `lib/api/projects.ts`, `lib/api/analysis.ts`
- Step 35 Wave 1 (atoms): `Button`, `Input`, `Toggle`, `Checkbox`, `StatusBadge`, `ScoreCircle`
- Step 35 Wave 1 (map): `MapContainer`, `SiteBoundaryOverlay`, `SiteLabel`, `ZoomControls`
- Step 35 Wave 2 (layout shells): `TopNav`, `RightPanel`, `AnalysisModuleSection`, `ExportDrawer`
- Step 36: All 6 screens — `/login`, `/dashboard`, `/project/new`, `/project/[id]`, `/project/[id]?export=true` (ExportDrawer overlay), `/settings`
- Step 37: TypeScript clean (`npx tsc --noEmit` → no errors) across all components + pages
- Mock data wired at API layer with `// TODO GH#53/54/55` comments; all unconfirmed endpoints stubbed
- `AnalysisModuleSection` expand/collapse via CSS `grid-template-rows: 0fr → 1fr` (no framer-motion — resolves #56)
- React-Leaflet dynamically imported (`next/dynamic`, `ssr: false`) on all map-bearing pages

**Phase 10 outputs (COMPLETE — 2026-06-12):**
- Step 39: Moderator guide — 5 tasks, observation sheets, issue capture template (`ux-research/phase-10/step-39-moderator-guide.md`)
- Step 40: Round 1 usability report — 4 Blockers, 1 Major identified (`ux-research/phase-10/step-40-usability-report.md`)
- Step 41: 4 issues resolved — export button in TopNav, map click handler, populated mock data, export defaults in Settings
- Step 42: Round 2 — Tasks 1/3/4/5 at 5/5. Beta Readiness Report: GO. GitHub Issue #58.
- **Beta Readiness: GO** — frontend complete, Supabase env vars required at deploy time
- Handoff to DevOps: configure `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, deploy to Vercel preview
- Open before real data flows: #53 (endpoints), #54 (export format), #55 (geo boundary)

---

## Related Docs

- `docs/integration-rules.md` — short canonical rule statement
- `docs/feature-flags.md` — flag conventions
- `docs/feature-validation/` — FVDs (one per Jira ticket)
- `docs/PROGRESS.md` — master timeline + sprint log
- `contracts/CHANGELOG.md` — contract version history
- `apps/web/AGENTS.md` — Next.js 16 specific rules
