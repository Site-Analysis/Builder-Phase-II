# Planning regulation configs — RMP-2015 (authoritative) · NBCS-2026 (fallback)

**Sprint-0 B/C container. Holds NO authoritative values yet.** Ships empty; cells are
transcribed from the **primary** PDFs later. This directory is *not* wired into
`planning_service` — that happens in **US-084**.

## Files
| File | Role |
|---|---|
| `rmp_2015.schema.json` | Human-facing JSON-Schema contract for a cell + config metadata |
| `rmp_2015.json` | RMP-2015 data — **empty template** (`cells: []`) |
| `nbcs_2026_fallback.json` | NBCS-2026 (SP 7:2026) fallback — **empty template** |
| `rmp_loader.py` | Loader + **strict validator** (the runtime gate) + `lookup_cell` |

## Cell shape
Keyed by `[zone × ring × road_width_band_m × plot_size_band_sqm]` →
`{ far, ground_coverage, setbacks{front_m,rear_m,side_m}, ecs{basis,value_per_100sqm},
mixed_use_pct }` + a **confidence** tier + **split provenance**.

## Split provenance (the confidence-ladder rule)
Every cell (and the config block) carries two provenance fields so an inferred fallback can
never be laundered into an authoritative-looking slot:

| Field | Meaning |
|---|---|
| `regulatory_source` | the **PRIMARY** citation — `{doc, page_ref, url}` (RMP-2015 Vol-III / gazette). |
| `transcription_origin` | where the value was **actually read this time** — `{source, confidence, url}`. MAY be OpenCity, which is `inferred`. |

**Rule (validator-enforced):** a cell tagged `confidence: "authoritative"` **must** have a
non-null `regulatory_source` (doc + page_ref). An **OpenCity-only** cell may be `inferred`
but can **never** be `authoritative`.

**Precedence (block ↔ cell):** an authoritative cell resolves its `regulatory_source` from
the **cell** if present, otherwise **inherited from the config block** (a shared citation
for a page/table of cells). If **both** are null/sentinel the cell is **REJECTED**. A
cell-level `regulatory_source`, when present, **overrides** the block; the block applies only
where the cell omits it. Consequence: once the first authoritative cell is transcribed, a
null block-level `regulatory_source` can no longer silently coexist with it — either the cell
carries its own citation or the block must be populated.

## The validator contract (why a guess / laundered cell fails)
`rmp_loader.load_config()` **raises `RMPConfigError`** (never defaults) when a cell:
- is tagged `authoritative` without a non-null `regulatory_source` (doc + page_ref);
- has a missing/sentinel `transcription_origin.source`, or an invalid confidence tier;
- has a sentinel number (`-1`, `9999`, NaN/Inf) or a null required value;
- has `far`/`ground_coverage` ≤ 0, or out-of-range coverage/mixed_use.

**Empty-and-marked is fine. Filled-with-a-guess (or laundered-fallback) is P0** and will not
load. `lookup_cell()` returns `None` for an unknown key — the caller must fall back to NBCS
(tagged `derived/fallback`) or return `unresolved`, never a default.

## Transcription protocol (Sprint-0 B, blocked on the PDF)
1. **Resolve the doc inconsistency first:** some tables read "RMP-2026" but the **operative
   plan is RMP-2015**. Confirm the operative table set before writing any cell.
2. Transcribe **2–3 cells** from the **primary** Vol-III PDF into `regulatory_source`
   (`doc` + `page_ref`), set `confidence: "authoritative"`, and set `transcription_origin`
   to the PDF. Verify them against the plan's **printed worked examples**, then build out.
3. OpenCity may **seed geometry / candidate values** only at `confidence: "inferred"`
   (`transcription_origin.source = OpenCity`, `regulatory_source: null`) — never authoritative.
4. Flip `status` `template-empty` → `partial-unverified` → `verified`.
5. Fill the matching expected values in `tests/fixtures/us084_far.json` (and
   `us085_premium.json` for premium), then remove their `PENDING` markers.

Treat any transcription error as **P0** — one wrong cell becomes thousands of wrong FAR
answers.

## Confirmed primary sources (use verbatim in `regulatory_source`)
- **RMP-2015 (authoritative):** RMP-2015 Vol-III Zoning Regulations — IndiaCode,
  `zoning_regulations_rmp2015f.pdf`, G.O. UDD 540 BEM AA SE 2004 dated 22-06-2007.
  **Table 22** = FAR & ground coverage; **Table 8** = setbacks by height & plot size;
  + the three-ring land-use classification.
- **NBCS-2026 (fallback only):** SP 7:2026 (NBCS 2026) — BIS gazette
  `CG-DL-E-30042026-272177` dated 30-Apr-2026 (withdrew SP 7:2016).

**Values are transcribed ONLY from these primary PDFs.** Secondary blog/SlideShare copies
are inferred-tier and must never fill an authoritative/derived cell. If the primary text is
not in hand, the cell stays empty + PENDING.

## Part B — dated setback amendment overlay (`amendments[]`)
The 11-Nov-2025 UDD small-plot setback amendment is modelled as a **dated overlay**, not an
overwrite: `{ effective_date:"2025-11-11", applies_to, supersedes:<base cell key>, status:
"draft"|"notified" (confirm from primary), setbacks:{…}, regulatory_source, transcription_origin }`.
Current/strictest governs; the base Table-8 cell keeps its own value + effective_date.
`amendments` is empty until the primary amendment values are supplied.

## Part C — NBCS fallback cells (`derived`, never authoritative)
Each NBCS cell carries `confidence:"derived"`, a `regulatory_source` = SP 7:2026 gazette,
**and** a `karnataka_adoption_status` (e.g. `"not_adopted_as_of:2026-06"`) + an
`enforceability_note`. Rationale: SP 7:2026 is advisory until Karnataka adopts it into
bye-laws (none as of mid-2026), and the Nov-2025 RMP amendment still mandates NBC-2016 for
fire up to 15 m — so a fallback value is **`derived`**, never a silent 2016→2026 swap. The
validator rejects a `derived` cell lacking either `regulatory_source` or
`karnataka_adoption_status`.
