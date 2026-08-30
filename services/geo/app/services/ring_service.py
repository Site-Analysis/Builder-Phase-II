# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Ring classification (US-082 Part 1) — RMP-2015 ch.1.2 (p.9) Ring I/II/III.

RMP-2015 defines three concentric planning rings (equivalent to TDR Zones A/B/C):
  * Ring I   — inside the Core Ring Road;
  * Ring II  — between the Core Ring Road and the Outer Ring Road;
  * Ring III — beyond the ORR but WITHIN the LPA.

CORE PRINCIPLE (same accuracy contract as the overlay engine): a point is classified ONLY by
point-in-polygon against ring polygons built from the real OSM road/boundary geometry. We NEVER
approximate a ring with a circle/buffer around a centre point. If the ring geometry is not
bundled — or a ring could not be closed reliably at prep time — the ring is `unresolved`, never
defaulted to Ring III.

Runtime is GeoJSON-ONLY (mirrors overlay_engine): the closed rings are produced dev-time by
`scripts/prep_ring_polygons.py` from OSM (Overpass) and written to
`services/geo/app/data/ka_rings.geojson`. A missing file → every ring `unresolved`.

Confidence is ALWAYS `inferred` — the rings are OSM-derived, not an RMP source. The LPA outer
bound is a municipal-boundary PROXY (labelled): a point outside it is `unresolved` (it may still
lie within the larger BDA LPA), never silently "outside".
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.overlay_engine import (
    _point_in_ring,
    assert_karnataka_latlon,
)

_DATA = Path(__file__).parent.parent / "data"
_RING_FILE = "ka_rings.geojson"
# feature `role` tag -> which ring boundary it is. Order matters: innermost first.
_ROLE_CORE = "core"
_ROLE_OUTER = "outer"
_ROLE_LPA = "lpa"

_CACHE: dict[str, Any] | None = None
_CACHE_LOADED = False


def _min_ring_pts(ring: list[list[float]]) -> bool:
    """A usable closed ring: >= 4 vertices and first == last (closed)."""
    return len(ring) >= 4 and ring[0][0] == ring[-1][0] and ring[0][1] == ring[-1][1]


def _load_rings() -> dict[str, Any] | None:
    """Load + validate the bundled ring polygons once. Returns a dict
    {role: {"exterior": [[lon,lat],...], "meta": {...}}} for every role whose polygon is present
    AND closes. Roles that are absent / unclosed are simply omitted -> the caller returns
    `unresolved` for the rings that depend on them. A missing file returns None."""
    global _CACHE, _CACHE_LOADED
    if _CACHE_LOADED:
        return _CACHE
    _CACHE_LOADED = True
    path = _DATA / _RING_FILE
    if not path.exists():
        _CACHE = None
        return None
    fc = json.loads(path.read_text(encoding="utf-8"))
    file_meta = fc.get("properties", {}) if isinstance(fc, dict) else {}
    rings: dict[str, Any] = {"_meta": file_meta}
    for f in fc.get("features", []):
        role = (f.get("properties") or {}).get("role")
        geom = f.get("geometry") or {}
        if role not in (_ROLE_CORE, _ROLE_OUTER, _ROLE_LPA):
            continue
        if geom.get("type") != "Polygon":
            continue
        coords = geom.get("coordinates") or []
        if not coords:
            continue
        exterior = coords[0]
        # CLOSURE GUARD: an unclosed / degenerate ring is NOT trusted -> omit it (the ring that
        # needs it becomes `unresolved`), never patched shut silently.
        if not _min_ring_pts(exterior):
            continue
        rings[role] = {"exterior": exterior, "meta": f.get("properties") or {}}
    _CACHE = rings
    return rings


def _unresolved(reason: str, next_action: str, *, source: str, vintage: str | None) -> dict[str, Any]:
    return {
        "status": "unresolved",
        "ring": None,
        "tdr_zone": None,
        "confidence": "inferred",
        "data_source": source,
        "data_vintage": vintage,
        "reg_basis": "RMP-2015 ch.1.2 (p.9) — Ring I/II/III = TDR Zones A/B/C",
        "reason": reason,
        "next_action": next_action,
        "notes": [],
    }


_RING_TO_TDR = {"I": "A", "II": "B", "III": "C"}
_SOURCE = "OSM (Core Ring Road + Outer Ring Road + municipal-boundary LPA proxy), Overpass"
_NEXT = ("confirm the planning ring against the RMP-2015 district map / with BDA before relying "
         "on ring-dependent Additional-FAR (reg 3.4.v)")


def classify_ring(lat: float, lon: float) -> dict[str, Any]:
    """Classify a WGS84 point into RMP Ring I/II/III (inferred, OSM-derived) by point-in-polygon.

    Raises ValueError for a swapped / out-of-Karnataka point (surfaced as 422 by the router).
    A point beyond the LPA proxy, or whose deciding ring geometry is unavailable, is
    `unresolved` — never defaulted to Ring III.
    """
    assert_karnataka_latlon(lat, lon)  # hard fail on lat/lon swap before any PIP

    rings = _load_rings()
    if rings is None:
        return _unresolved(
            "ring geometry is not bundled (ka_rings.geojson absent) — the Core/Outer Ring Road "
            "polygons have not been prepped from OSM",
            "run scripts/prep_ring_polygons.py to build the ring polygons, then retry",
            source=_SOURCE, vintage=None,
        )
    vintage = rings.get("_meta", {}).get("built")
    have = {r for r in (_ROLE_CORE, _ROLE_OUTER, _ROLE_LPA) if r in rings}

    core = rings.get(_ROLE_CORE)
    outer = rings.get(_ROLE_OUTER)
    lpa = rings.get(_ROLE_LPA)

    in_core = bool(core) and _point_in_ring(lon, lat, core["exterior"])
    in_outer = bool(outer) and _point_in_ring(lon, lat, outer["exterior"])
    in_lpa = bool(lpa) and _point_in_ring(lon, lat, lpa["exterior"])

    # Ring I — inside the Core Ring Road. Needs the core polygon to assert it.
    if core is None and (outer is None or lpa is None):
        return _unresolved(
            f"ring geometry incomplete (closed rings available: {sorted(have) or 'none'}) — cannot "
            "classify without at least the deciding boundary",
            "re-run the ring prep; a ring that could not be closed at prep time is withheld",
            source=_SOURCE, vintage=vintage,
        )

    if in_core:
        if core is None:
            return _unresolved(
                "Core Ring Road polygon unavailable — cannot confirm Ring I vs Ring II",
                _NEXT, source=_SOURCE, vintage=vintage,
            )
        return _resolved("I", vintage, ["inside the Core Ring Road (OSM-derived polygon)"])

    if in_outer:
        # inside ORR but not core.
        if core is None:
            return _unresolved(
                "inside the Outer Ring Road but the Core Ring Road polygon is unavailable — "
                "cannot distinguish Ring I from Ring II",
                _NEXT, source=_SOURCE, vintage=vintage,
            )
        return _resolved("II", vintage, ["between the Core and Outer Ring Roads (OSM-derived)"])

    if in_lpa:
        # beyond ORR, within the LPA proxy -> Ring III.
        return _resolved(
            "III", vintage,
            ["beyond the Outer Ring Road, within the LPA (municipal-boundary proxy) — OSM-derived"],
        )

    # Outside the LPA proxy. Do NOT default to Ring III.
    if lpa is None:
        return _unresolved(
            "beyond the Outer Ring Road but the LPA boundary polygon is unavailable — Ring III "
            "cannot be confirmed and is NOT assumed",
            _NEXT, source=_SOURCE, vintage=vintage,
        )
    return _unresolved(
        "outside the LPA proxy (OSM municipal boundary) — the point may still lie within the "
        "larger BDA LPA, so the ring is not assumed",
        "confirm against the BDA LPA boundary / RMP-2015 district map — do not assume Ring III",
        source=_SOURCE, vintage=vintage,
    )


def _resolved(ring: str, vintage: str | None, notes: list[str]) -> dict[str, Any]:
    return {
        "status": "resolved",
        "ring": ring,
        "tdr_zone": _RING_TO_TDR[ring],
        "confidence": "inferred",  # OSM-derived — NEVER authoritative unless from an RMP source
        "data_source": _SOURCE,
        "data_vintage": vintage,
        "reg_basis": "RMP-2015 ch.1.2 (p.9) — Ring I/II/III = TDR Zones A/B/C",
        "reason": None,
        "next_action": _NEXT,
        "notes": notes + [
            "INFERRED from OSM road/boundary geometry — not an RMP source; confirm before relying "
            "on ring-dependent Additional-FAR."
        ],
    }
