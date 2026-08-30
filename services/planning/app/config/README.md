# Planning regulation configs — RMP-2015 (authoritative) · NBCS-2026 (fallback)

**RMP-2015 base is TRANSCRIBED** (Part A/B base) by reading the primary RMP-2015 Vol-III PDF
via `pymupdf` positioned extraction — every FAR/GC/setback value verified against its printed
table, not from any secondary/pasted copy. NBCS-2026 fallback stays an empty template. Not yet
wired into `planning_service` — that happens in **US-084**.

## Files
| File | Role |
|---|---|
| `rmp_2015.schema.json` | JSON-Schema contract: `far_tables` / `far_modifiers` / `setback_rules` + legacy `cell` + config metadata |
| `rmp_2015.json` | RMP-2015 data — **base transcribed** (`status: partial-verified`, 9 `far_tables`) |
| `nbcs_2026_fallback.json` | NBCS-2026 (SP 7:2026) fallback — **empty template** |
| `rmp_loader.py` | Loader + **strict validator** + `lookup_far` / `governing_setbacks` / (legacy `lookup_cell`) |

## Gate-0 structure (the RMP does NOT key FAR uniformly)
Verified against the PDF: **ring does not set base FAR**, and **FAR keying differs per zone**.
So the config uses:
- **`far_tables[]`** — one per zone, each with `key_type`:
  - `plot_size` — Residential-Main (Table 10), Industrial/P&SP/T&T — rows carry `plot_size_band_sqm`;
  - `road_width` — Commercial-Business (Table 14), Residential-Mixed (Table 12), Mutation (Table 15) — rows carry `road_width_band_m`;
  - `flat` — Commercial-Central (Table 13) — one row, keyed by neither.
- **`far_modifiers`** — `additional_far_by_ring` (reg 3.4.v, Ring I/II incentive OVER base) +
  `metro_terminal_override` (reg 3.16.ix, 150 m → max FAR 4, post-completion/BMRCL). **Ring is a
  modifier here, not a base-FAR axis.**
- **`setback_rules`** — decoupled from FAR: `table8_low_rise` (≤11.5 m & ≤4000 sqm, keyed by site
  width/depth; >9 m band is a `%`) + `table9_by_height`. `lookup_far()` / `governing_setbacks()`.

The legacy rigid `cell` block (`[zone × ring × road × plot]`) is retained for back-compat but
left empty (`cells: []`) — it mis-modelled the tables.

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

## Part B — dated setback amendment overlays (`amendments[]`) — BOTH NON-GOVERNING
Two 2025 amendments are recorded as dated overlays; **neither is applied** (`governing:false`)
because neither PDF could be read:
- **Aug-2025** (`d7b00660…`, UDD 31 MNJ 2022(E), 01.08.2025, FINAL): Table 8 threshold 11.5→12 m,
  Table 9 stilt-floor rewrite, Mutation cap 12000→10000 sqm. PDF is **Type0/CID fonts, no
  ToUnicode** → no readable text. `status:"final-unreadable"`, `confidence:"inferred"`.
- **Nov-2025** (`revised-setback-gazette-copy.pdf`, UDD 235 MNJ 2025(E), 11.11.2025): full Table 8
  replacement for small plots. Header says **DRAFT** and the PDF is a **raster scan (0 text)** →
  in-force status unconfirmed + values unread. `status:"draft"`, `confidence:"inferred"`.

**Rule applied:** the strictest **in-force** overlay governs; a draft never supersedes the
notified base; an unread value is never transcribed. With both unreadable, the **RMP-2015 base
Table 8/9 governs**. To complete these: supply a searchable/notified copy (or OCR) — then the
values move to `authoritative` + `governing:true` per the strictest-in-force rule.

## Part C — NBCS fallback cells (`derived`, never authoritative)
Each NBCS cell carries `confidence:"derived"`, a `regulatory_source` = SP 7:2026 gazette,
**and** a `karnataka_adoption_status` (e.g. `"not_adopted_as_of:2026-06"`) + an
`enforceability_note`. Rationale: SP 7:2026 is advisory until Karnataka adopts it into
bye-laws (none as of mid-2026), and the Nov-2025 RMP amendment still mandates NBC-2016 for
fire up to 15 m — so a fallback value is **`derived`**, never a silent 2016→2026 swap. The
validator rejects a `derived` cell lacking either `regulatory_source` or
`karnataka_adoption_status`.
