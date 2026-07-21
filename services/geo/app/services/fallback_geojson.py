# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Non-KGIS inferred-tier fallback: local point-in-polygon over a bundled open-data
GeoJSON layer.

Second tier behind the KGIS-live seam. Confidence is FORCED to ``inferred`` and every
answer carries ``mode`` + ``data_source`` + ``data_vintage`` (the source's real snapshot
date) so the caller can render it visibly distinct from KGIS-live. When the layer file is
ABSENT or NO polygon contains the point, returns an ``unresolved`` object — NEVER a default,
"clear", or a fabricated polygon.

Coordinate order is PER-LAYER, not global: some open-data GeoJSON (KML-derived) ships
``[lat, lon]`` instead of the GeoJSON-standard ``[lon, lat]``. ``load(coord_order=...)``
normalizes to internal ``[lon, lat]``; a **Karnataka-bounds canary** then FAILS LOUD
(``FallbackLayerError``) if points land outside Karnataka after parsing — catching a silent
lat/lon swap. NEVER edit the data to fix an order problem; configure ``coord_order``.

Dependency-free (hand-rolled ray-casting PIP + a bbox prefilter, matching the geo service's
no-shapely convention).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MODE_KGIS = "kgis-live"
MODE_FALLBACK = "inferred-fallback"
MODE_UNRESOLVED = "unresolved"

# Karnataka bounding box — the lat/lon-swap canary. A parsed point outside this is the
# signal that coordinate order was read wrong (or the data isn't Karnataka).
KA_LON = (74.0, 78.6)
KA_LAT = (11.5, 18.5)


class FallbackLayerError(ValueError):
    """A bundled layer failed to validate (coordinate order / bounds canary)."""


def unresolved(reason: str, next_action: str, *, data_source: str | None = None) -> dict[str, Any]:
    """The Accuracy-Contract unresolved shape. value is always null — never a guess."""
    return {
        "status": "unresolved",
        "mode": MODE_UNRESOLVED,
        "confidence": "unresolved",
        "reason": reason,
        "next_action": next_action,
        "data_source": data_source,
        "data_vintage": None,
        "value": None,
    }


# ── geometry helpers (internal order is [lon, lat]) ─────────────────────────
def _swap_geom(geom: dict) -> None:
    """In place: swap every coordinate pair [a, b] → [b, a] (lat,lon → lon,lat)."""
    def swap(c: Any) -> None:
        if isinstance(c, list):
            if c and isinstance(c[0], (int, float)) and len(c) >= 2:
                c[0], c[1] = c[1], c[0]
            else:
                for x in c:
                    swap(x)
    swap(geom.get("coordinates") or [])


def _first_point(geom: dict) -> tuple[float, float] | None:
    c: Any = geom.get("coordinates") or []
    while isinstance(c, list) and c and not isinstance(c[0], (int, float)):
        c = c[0]
    if isinstance(c, list) and len(c) >= 2 and isinstance(c[0], (int, float)):
        return float(c[0]), float(c[1])
    return None


def _bbox(geom: dict) -> tuple[float, float, float, float] | None:
    xs: list[float] = []
    ys: list[float] = []

    def walk(c: Any) -> None:
        if isinstance(c, (list, tuple)):
            if c and isinstance(c[0], (int, float)):
                xs.append(float(c[0]))
                ys.append(float(c[1]))
            else:
                for x in c:
                    walk(x)

    walk(geom.get("coordinates") or [])
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _ring_contains(ring: list, lon: float, lat: float) -> bool:
    n = len(ring)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def _rings_contain(rings: list, lon: float, lat: float) -> bool:
    if not rings or not _ring_contains(rings[0], lon, lat):
        return False
    return not any(_ring_contains(hole, lon, lat) for hole in rings[1:])


def _geom_contains(geom: dict, lon: float, lat: float) -> bool:
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    if t == "Polygon":
        return _rings_contain(coords, lon, lat)
    if t == "MultiPolygon":
        return any(_rings_contain(poly, lon, lat) for poly in coords)
    return False


def _assert_karnataka(features: list, sample: int) -> None:
    """Raise if a sampled parsed point falls outside Karnataka — the lat/lon-swap canary."""
    checked = 0
    for feat in features:
        pt = _first_point(feat.get("geometry") or {})
        if pt is None:
            continue
        lon, lat = pt
        if not (KA_LON[0] <= lon <= KA_LON[1] and KA_LAT[0] <= lat <= KA_LAT[1]):
            raise FallbackLayerError(
                f"parsed point (lat={lat}, lon={lon}) is outside Karnataka "
                f"[lat {KA_LAT}, lon {KA_LON}] — coordinate order is likely wrong "
                f"(lat/lon-swap canary). Configure coord_order per layer; never edit the data."
            )
        checked += 1
        if checked >= sample:
            break
    if checked == 0:
        raise FallbackLayerError("no coordinates found to bounds-check")


# ── public API ──────────────────────────────────────────────────────────────
def load(
    path: str | Path, *, coord_order: str = "lonlat", bounds_check: bool = True, sample: int = 50,
) -> list[dict]:
    """Parse + normalize a layer to internal [lon, lat], precompute per-feature bbox, and
    run the Karnataka-bounds canary. Raises FallbackLayerError on a swap/out-of-bounds.

    coord_order: "lonlat" (GeoJSON standard) or "latlon" (KML-derived; will be swapped).
    """
    if coord_order not in ("lonlat", "latlon"):
        raise FallbackLayerError(f"coord_order must be 'lonlat'|'latlon', got {coord_order!r}")
    fc = json.loads(Path(path).read_text(encoding="utf-8"))
    feats = fc.get("features") or []
    for feat in feats:
        geom = feat.get("geometry") or {}
        if coord_order == "latlon":
            _swap_geom(geom)
        feat["_bbox"] = _bbox(geom)
    if bounds_check:
        _assert_karnataka(feats, sample)
    return feats


def locate_features(
    features: list, lat: float, lon: float, *,
    layer_name: str, data_source: str, data_vintage: str,
    next_action_no_match: str, name_field: str | None = None,
) -> dict[str, Any]:
    """PIP over already-loaded features (internal [lon, lat]). Inferred hit, or unresolved."""
    for feat in features:
        bb = feat.get("_bbox") or _bbox(feat.get("geometry") or {})
        if bb and not (bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3]):
            continue
        if _geom_contains(feat.get("geometry") or {}, lon, lat):
            props = feat.get("properties") or {}
            return {
                "status": "resolved",
                "mode": MODE_FALLBACK,
                "confidence": "inferred",
                "data_source": data_source,
                "data_vintage": data_vintage,
                "name": props.get(name_field) if name_field else None,
                "properties": props,
                "value": props,
            }
    return unresolved(
        reason=f"{layer_name}: point ({lat},{lon}) is outside all bundled polygons",
        next_action=next_action_no_match,
        data_source=data_source,
    )


def locate(
    path: str | Path, lat: float, lon: float, *,
    layer_name: str, data_source: str, data_vintage: str,
    next_action_absent: str, next_action_no_match: str,
    coord_order: str = "lonlat", name_field: str | None = None, bounds_check: bool = True,
) -> dict[str, Any]:
    """Convenience: absent file → unresolved; else load (canary may raise loud) + PIP."""
    p = Path(path)
    if not p.exists():
        return unresolved(
            reason=f"{layer_name}: fallback layer not bundled — PENDING DIGITIZATION/DOWNLOAD ({p.name})",
            next_action=next_action_absent,
            data_source=data_source,
        )
    feats = load(p, coord_order=coord_order, bounds_check=bounds_check)
    return locate_features(
        feats, lat, lon, layer_name=layer_name, data_source=data_source,
        data_vintage=data_vintage, next_action_no_match=next_action_no_match, name_field=name_field,
    )
