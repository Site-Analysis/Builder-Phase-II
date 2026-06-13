---
name: phase-6-design-reference
description: Visual design reference for Phase 6 wireframing — confirmed layout patterns from user-provided screenshots
metadata:
  type: project
---

# Phase 6 — Design Reference

## Dashboard (/dashboard) — CONFIRMED FROM SCREENSHOT 2026-06-11

### Layout
- TopNav: SAT logo + map icon (left) · nav items · settings icon + user avatar (right)
- Stats row: 4 summary cards — Total projects · Fully analysed · Needs review · This month
- Main content: 3-column card grid
- Last card slot: "Start a new analysis" inline CTA

### Project card anatomy
- Map thumbnail (top, full card width)
- Status badge top-right on thumbnail: "Needs review" (amber) · "Complete" (green)
- Project name (bold)
- Location (icon + text, color/text/secondary)
- Star/dot rating
- Date
- "..." overflow menu (top-right of card)

### Design aesthetic confirmed
- Background: color/neutral/bg (#F8F9FA)
- Cards: color/neutral/surface (#FFFFFF) with subtle shadow
- Primary CTA button: color/brand/secondary teal (#2E7D6F) — "+ New Analysis"
- Navigation: clean, minimal, text-weight labels
- Status system: amber = Needs review, green = Complete — maps to semantic tokens

### Tone
Professional, minimal, architect-friendly — no decorative elements, data-forward.

## New Analysis (/project/new) — CONFIRMED 181331

- Full-screen map background (no sidebar)
- Centered floating card overlay: address search field + "Use current info" button + instruction text
- TopNav: SAT logo + "Projects" breadcrumb + "New Analysis" active item
- No analysis panel visible — pure map + single overlay card

## Main Analysis Interface (/project/[id]) — CONFIRMED 181353

- Map: FULL SCREEN background, ~60% viewport width (left)
- Site boundary: circle/polygon overlay on map in accent colour
- Site label: bottom-left on map — project name + coordinates + area + date
- Zoom controls: top-left of map (+/-)
- Right panel: ~38% width, always visible, scrollable, white bg
  - Top: Overall Site Score (circular donut gauge, large) + verdict text ("Buildable with mitigation") + module progress bar (5/5 modules)
  - Description paragraph (binding constraint summary)
  - Module sections below: collapsible, each with name + severity badge + score circle + indicators list
  - Module toggle: scroll through modules in panel (NOT tabs, NOT separate routes)
- No floating layer toggle visible — layers implied by right panel module sections

## Module Panel Detail — CONFIRMED 181403 (Rainfall shown, pattern applies to all)

- Same right panel, scrolled — not a separate screen
- Module header: icon + module name + severity badge (e.g. "High Rainfall") + circular score (92)
- Data source tag + recency year (e.g. "Open-Meteo · 2025")
- One-sentence summary ("~2,637 mm annual; peak in Jul. Bimodal monsoon pattern.")
- Chart: bar chart for time-series data (monthly rainfall)
- INDICATORS section: each indicator = label + value + unit + horizontal bar + source citation

## Export Drawer (?export=true) — CONFIRMED 181414 + 181420

- Full-width overlay split horizontally
- LEFT (config, ~35%):
  - Header: "Export Report" + subtitle "Download-ready PDF with citations"
  - INCLUDE MODULES: checklist per module (checkbox + name + severity)
  - REPORT SETTINGS: toggles — cover page & site map, source citations appendix,
    confidence & resolution notes, studio letterhead, raw data tables (CSV embed)
  - Footer: Cancel (ghost) + Generate PDF (teal, primary)
- RIGHT (preview, ~65%):
  - Live PDF preview rendering
  - SAT header + studio name + project name + site metadata
  - Overall score + module summaries with scores
  - Citations & Provenance Appendix section at bottom

## Pending screenshots
- Login (/login) — not provided; use standard auth pattern with design tokens
- Settings (/settings) — not provided; standard profile/account page
- Flood / Sunpath / Wind / Temperature panels — pattern confirmed from Rainfall (181403), apply same structure
