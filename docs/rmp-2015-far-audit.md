# RMP-2015 FAR / GC / Setback Transcription Audit

**Date:** 2026-07-28
**Auditor:** manual double-entry + multi-channel extraction
**Config under audit:** `services/planning/app/config/rmp_2015.json`
**Primary source:** BDA Revised Master Plan 2015, Vol-III (Zoning Regulations) PDF
(`RMP - 2015.pdf`, 69 pp; printed page N = PDF page index N)
**Permanent guard:** `tests/planning_rmp_integrity_smoke.py`

## Why this audit exists

RERA sanction-match validation is deferred. A **transcription error** in the FAR/GC/setback
config is the single highest-risk defect in the product: a wrong-but-internally-consistent
number is not caught by any structural invariant, and it renders an authoritative-looking
capacity figure that is simply false. This audit is the substitute accuracy check on the
**36 transcribed FAR/GC cells** (plus Table 8/9 setbacks and the ring modifier) until RERA
validation lands.

**Scope, stated plainly:** this verifies that the config faithfully reproduces the printed
RMP-2015 tables — **transcription accuracy, NOT sanction-match**. It does *not* assert that a
given plot's sanctioned FAR equals the table value (site-specific overrides, amendments,
authority discretion). RERA / sanction validation remains deferred.

## Method — three independent channels

A double-entry check only works if the two reads are genuinely independent. Two text
extractions from the same PDF share one text layer and can fail identically (correlated
failure). So three channels were used:

1. **Text channel A (original):** pymupdf *positioned-word* coordinate reconstruction
   (the transcription that produced the config).
2. **Text channel B (re-read):** pymupdf `get_text()` linear span dump — a different code
   path — diffed cell-by-cell against the config.
3. **Pixel channel (independent of the text layer):** each table page rendered to PNG at
   ~2.2× and the **glyph pixels** read directly. Glyph outlines cannot share a character-
   encoding fault with the text stream, so this breaks correlated failure.

The main RMP text layer is real embedded-font text (extracts as clean English), **not** the
CID/no-ToUnicode glyph-code garbage seen in the 2025 amendment PDFs — already lowering
text/text correlation. The pixel channel was then applied to **all 12 table pages**, driving
residual risk on every one of the 36 cells to near-zero.

## Result — zero disagreements

| Table | Page | Cells | Text B | Pixel |
|---|---|---|---|---|
| 10 Residential (Main) | 27 | 5 × FAR/GC/road | match | match |
| 12 Residential (Mixed) | 28 | 5 × FAR/GC/road | match | match |
| 13 Commercial (Central) | 30 | 1 × FAR/GC | match | match |
| 14 Commercial (Business) | 31 | 6 × FAR/GC/road | match | match |
| 15 Mutation Corridor | 32 | 2 × FAR/GC/road | match | match |
| 16 Industrial (General) | 34 | 4 × FAR/GC + inline setbacks | match | match |
| 17 Industrial (Hi-Tech) | 35 | 5 × FAR/GC/road | match | match |
| 18 Public & Semi-Public | 36 | 4 × FAR/GC | match | match |
| 19 Traffic & Transportation | 37 | 4 × FAR/GC | match | match |
| 8 Setbacks (≤11.5 m) | 19 | 3 bands + >4000 | match | match |
| 9 Setbacks (>11.5 m) | 20 | 11 height bands | match | match |
| Ring additional-FAR | 21 | 5 cells + 1 blank | match | match |
| Metro terminal override | 25 | 150 m / FAR 4 | match | n/a (prose) |

**Every value agrees across all channels. No cell was changed** — the config was already
correct.

### Confirmed real-world quirks (NOT errors)

- **Table 16 (Industrial General) FAR *decreases* with plot size** — 1.50 → 1.25 → 1.00 →
  1.00. This violates the naive "FAR non-decreasing" expectation but is exactly what p.34
  prints. The integrity test **locks it non-increasing** (whitelisted), so a future edit that
  silently "corrects" it upward will fail the test.
- **Ring-II above 4000 sqm is genuinely BLANK in the PDF** (p.21) — confirmed in the pixel
  render, not merely missing from the text. The config's `PENDING` / `unspecified` state is
  the correct honest read; a number there would be fabricated. The test asserts Ring-II never
  gains a band above 4000.

### Boundary reads confirmed genuine

- Tables 18 & 19 row 2 print "Up to 1000"; config's `500–1000` is inferred from adjacent rows
  (row 1 `≤500`, row 3 `Above 1000`) and confirmed against the page.
- Tables 10 & 17 closed tops (20000 / 12000) are the tables' own printed domain caps
  ("up to 20000" / "up to 12000"), not gaps.

### Extraction gotcha (tooling note, not a data error)

Tables 16 and 17 are labelled `Table.16` / `Table.17` (dot, no space); a naive
`Table\s*16` locator misses them. Flagged so future tooling does not silently drop them.

## Structural integrity — permanent test

`tests/planning_rmp_integrity_smoke.py` (**8 tests, all pass**) re-runs on any future config
edit and asserts:

- **Band continuity** — no gap / no overlap between consecutive bands (every far_table,
  Table 8, Table 9, ring).
- **Coverage** — bands start at 0 and reach an open top or the declared cap.
- **Monotonicity** — FAR non-decreasing / GC non-increasing, with the Table 16 decreasing
  quirk locked.
- **Setbacks** — Table 9 height bands continuous and strictly increasing (5 → 16 m); Table 8
  site-dim bands continuous.
- **Modifiers** — ring bands continuous per ring; Ring-II >4000 stays PENDING.

## Confidence

**High** that the 36 cells are correct: every value survived two text channels and an
independent pixel channel across all 12 table pages; the one monotonicity anomaly is a real
RMP feature; the one blank cell is genuinely blank. This closes transcription risk on the
moat. **RERA / sanction-match validation remains deferred** and is tracked separately.
