# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""RMP-2015 FAR/GC/setback config STRUCTURAL INTEGRITY audit (permanent).

This is NOT a value re-transcription (no invariant can catch a wrong-but-consistent
number — that is caught by the double-entry re-read against the PDF). This asserts the
MECHANICAL structure of services/planning/app/config/rmp_2015.json so any future config
edit re-runs the audit:

  * BAND CONTINUITY  — consecutive bands touch (prev.max == next.min): no gap, no overlap.
  * COVERAGE         — bands start at 0 and reach the table's cap / an open top.
  * MONOTONICITY     — FAR non-decreasing and GC non-increasing as the keying dimension
                       grows. ONE documented real-world exception is locked, not skipped:
                       Industrial (General) FAR *decreases* (1.50->1.25->1.00->1.00) —
                       verified against RMP-2015 Vol-III p.34. It is asserted non-INCREASING
                       so a future edit that silently "corrects" it upward trips this test.
  * SETBACKS         — Table 9 height bands continuous AND strictly increasing; Table 8
                       site-dimension bands continuous.
  * MODIFIERS        — additional-FAR ring bands continuous per ring; the Ring-II >4000
                       cell is BLANK in the PDF -> must remain PENDING (no row present).

Pure JSON read, no `app` import (no cross-service collision). Run:
    pytest tests/planning_rmp_integrity_smoke.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_CFG = (
    Path(__file__).resolve().parents[1]
    / "services" / "planning" / "app" / "config" / "rmp_2015.json"
)

# Industrial (General): FAR legitimately DECREASES with plot size (RMP-2015 p.34, Table 16).
_FAR_DECREASING_OK = {("Industrial", "General")}


def _config() -> dict:
    return json.loads(_CFG.read_text(encoding="utf-8"))


def _band_key(row: dict) -> str | None:
    if "plot_size_band_sqm" in row:
        return "plot_size_band_sqm"
    if "road_width_band_m" in row:
        return "road_width_band_m"
    return None


def _bands(rows: list[dict]) -> list[tuple[float, float | None]]:
    out = []
    for r in rows:
        k = _band_key(r)
        if k is None:
            continue
        out.append((r[k]["min"], r[k]["max"]))
    return out


def _far_tables() -> list[dict]:
    return _config()["far_tables"]


def _tid(t: dict) -> str:
    return f'{t["zone"]}/{t["sub_zone"]}'


def test_band_continuity_no_gap_no_overlap():
    """Consecutive bands must touch: prev.max == next.min. A gap or overlap = likely slip."""
    for t in _far_tables():
        bands = _bands(t["rows"])
        if len(bands) < 2:
            continue  # flat table (e.g. Commercial/Central) has no bands
        for (lo, hi), (nlo, nhi) in zip(bands, bands[1:]):
            assert hi is not None, f"{_tid(t)}: non-final band has open max {(lo, hi)}"
            assert hi == nlo, (
                f"{_tid(t)}: band discontinuity {(lo, hi)} -> {(nlo, nhi)} "
                f"(gap or overlap — check the PDF)"
            )


def test_coverage_starts_at_zero_and_reaches_cap():
    """Bands must start at 0 and reach an open top or the table's stated cap."""
    for t in _far_tables():
        bands = _bands(t["rows"])
        if not bands:
            continue
        assert bands[0][0] == 0, f"{_tid(t)}: first band does not start at 0: {bands[0]}"
        top = bands[-1][1]
        cap = t.get("plot_cap_sqm")
        # Open top (null) = full coverage. A CLOSED top is fine when it is the table's own
        # stated domain cap (e.g. Table 10 'up to 20000', Table 17 'up to 12000' — printed
        # inline in the last band, no separate plot_cap field). But if plot_cap_sqm IS
        # declared, the bands must actually reach it, else there is an uncovered range.
        if cap is not None:
            assert top is None or top == cap, (
                f"{_tid(t)}: plot_cap {cap} declared but bands stop at {top} "
                f"-- plots between {top} and {cap} are uncovered"
            )


def test_far_monotonic_with_locked_industrial_quirk():
    """FAR non-decreasing as the keying dimension grows — except Industrial/General, which
    is locked non-INCREASING (real RMP quirk, p.34)."""
    for t in _far_tables():
        fars = [r["far"] for r in t["rows"] if "far" in r]
        if len(fars) < 2:
            continue
        if (t["zone"], t["sub_zone"]) in _FAR_DECREASING_OK:
            for a, b in zip(fars, fars[1:]):
                assert b <= a, (
                    f"{_tid(t)}: FAR rose {a}->{b} but this table is the locked "
                    f"DECREASING quirk — a re-transcription may have flipped it"
                )
        else:
            for a, b in zip(fars, fars[1:]):
                assert b >= a, f"{_tid(t)}: FAR decreased {a}->{b} (unexpected — check PDF)"


def test_ground_coverage_monotonic_non_increasing():
    """GC must not rise as the keying dimension grows (holds for every RMP table)."""
    for t in _far_tables():
        gcs = [r["ground_coverage"] for r in t["rows"] if "ground_coverage" in r]
        for a, b in zip(gcs, gcs[1:]):
            assert b <= a, f"{_tid(t)}: ground_coverage rose {a}->{b} (check PDF)"


def test_table9_height_bands_continuous_and_increasing():
    """Table 9: height bands continuous; all-around setback strictly increases."""
    rows = _config()["setback_rules"]["base"]["table9_by_height"]["rows"]
    bands = [(r["height_band_m"]["min"], r["height_band_m"]["max"]) for r in rows]
    assert bands[0][0] == 11.5, f"Table 9 starts at {bands[0][0]}, expected 11.5"
    for (lo, hi), (nlo, nhi) in zip(bands, bands[1:]):
        assert hi == nlo, f"Table 9 height gap/overlap {(lo, hi)} -> {(nlo, nhi)}"
    setbacks = [r["all_around_m"] for r in rows]
    for a, b in zip(setbacks, setbacks[1:]):
        assert b > a, f"Table 9 setback not increasing: {a} -> {b}"


def test_table8_site_dim_bands_continuous():
    """Table 8: site-dimension bands continuous from 0."""
    rows = _config()["setback_rules"]["base"]["table8_low_rise"]["rows"]
    bands = [(r["site_dim_band_m"]["min"], r["site_dim_band_m"]["max"]) for r in rows]
    assert bands[0][0] == 0, f"Table 8 first band starts at {bands[0][0]}, expected 0"
    for (lo, hi), (nlo, nhi) in zip(bands, bands[1:]):
        assert hi == nlo, f"Table 8 site-dim gap/overlap {(lo, hi)} -> {(nlo, nhi)}"
    assert bands[-1][1] is None, "Table 8 last band should be open (>9 m)"


def test_ring_modifier_bands_continuous_per_ring():
    """Additional-FAR ring bands continuous within each ring; additional_far non-decreasing."""
    rows = _config()["far_modifiers"]["additional_far_by_ring"]["rows"]
    by_ring: dict[str, list[dict]] = {}
    for r in rows:
        by_ring.setdefault(r["ring"], []).append(r)
    for ring, rr in by_ring.items():
        bands = [(x["plot_size_band_sqm"]["min"], x["plot_size_band_sqm"]["max"]) for x in rr]
        assert bands[0][0] == 0, f"Ring {ring}: first band starts at {bands[0][0]}"
        for (lo, hi), (nlo, nhi) in zip(bands, bands[1:]):
            assert hi == nlo, f"Ring {ring}: band gap/overlap {(lo, hi)} -> {(nlo, nhi)}"
        fars = [x["additional_far"] for x in rr]
        for a, b in zip(fars, fars[1:]):
            assert b >= a, f"Ring {ring}: additional_far decreased {a} -> {b}"


def test_ring2_above_4000_stays_pending():
    """Ring-II >4000 sqm is BLANK in the PDF (p.21) — must remain PENDING (no row),
    never silently filled."""
    rows = _config()["far_modifiers"]["additional_far_by_ring"]["rows"]
    ring2 = [r for r in rows if r["ring"] == "II"]
    top = max(r["plot_size_band_sqm"]["max"] for r in ring2)
    assert top == 4000, (
        f"Ring II now has a band above 4000 (top={top}) — the source cell is blank; "
        f"a value here would be fabricated. Keep it in `unspecified`, not `rows`."
    )
    assert "unspecified" in _config()["far_modifiers"]["additional_far_by_ring"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
