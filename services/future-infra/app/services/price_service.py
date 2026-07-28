# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-090 PART 3 — indicative price UPSIDE as a RANGE (never a point estimate).

price_upside = Kaveri guidance value × a hedonic distance-decay premium off the nearest QUALIFYING
infra node. Method: MPRA 124686 (metro proximity premium ~10–20% peaking ~200–500 m, decaying with
distance). Reported as {low, high, method, confidence, as_of} — the schema forbids a scalar price.

Honesty rules baked in:
  * guidance value is an INPUT (caller-supplied / Kaveri seam). Absent -> `unresolved`, NOT zero.
  * only Operational / Under-Construction nodes contribute premium. Approved/Planned = a future
    prospect (no built value yet); Cancelled/Tendered contribute NOTHING (the whole point of US-090).
  * confidence is `inferred` — a hedonic model, not a valuation. The disclaimer travels with it.

Pure + dependency-free (stdlib only) so it is deterministically testable offline.
"""

from __future__ import annotations

import math
from typing import Any

from app.models.future_infra import UPSIDE_STATUSES
from app.services.pipeline_service import wgs84_to_utm43n

_METHOD = (
    "Hedonic distance-decay off the nearest operational/under-construction node "
    "(MPRA 124686): metro premium ~10–20% peak within ~500 m, decaying to 0 by ~2 km; "
    "applied to the caller-supplied Kaveri guidance value."
)

# Distance-decay premium bands as (max_distance_m, low_fraction, high_fraction). Peak plateau to
# 500 m, then decays; beyond the last band the premium is 0 (a real 'no upside', not unresolved).
_DECAY: list[tuple[float, float, float]] = [
    (500.0, 0.10, 0.20),
    (1000.0, 0.06, 0.12),
    (1500.0, 0.03, 0.07),
    (2000.0, 0.01, 0.03),
]


def _premium_band(distance_m: float) -> tuple[float, float]:
    for max_d, low, high in _DECAY:
        if distance_m <= max_d:
            return low, high
    return 0.0, 0.0


def _qualifying_nodes(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Node points that MAY carry premium: only Operational / Under-Construction. LineStrings
    (metro/expressway/ring) contribute each vertex as a node; Points contribute themselves. Cancelled
    / Tendered / Approved / Planned are excluded up front."""
    nodes: list[dict[str, Any]] = []
    for feat in features:
        props = feat.get("properties", {})
        if props.get("status") not in UPSIDE_STATUSES:
            continue
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        pts: list[list[float]] = []
        if gtype == "Point":
            pts = [coords]
        elif gtype == "LineString":
            pts = coords
        elif gtype == "Polygon" and coords:
            pts = coords[0]
        for lon_v, lat_v in pts:
            nodes.append({
                "lat": float(lat_v), "lon": float(lon_v),
                "name": props.get("name"), "type": props.get("type"),
                "status": props.get("status"),
            })
    return nodes


def nearest_qualifying_node(
    lat: float, lon: float, features: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, float | None]:
    px, py = wgs84_to_utm43n(lat, lon)
    best: dict[str, Any] | None = None
    best_d = math.inf
    for node in _qualifying_nodes(features):
        nx, ny = wgs84_to_utm43n(node["lat"], node["lon"])
        d = math.hypot(px - nx, py - ny)
        if d < best_d:
            best_d, best = d, node
    if best is None:
        return None, None
    return best, round(best_d, 1)


def build_price_upside(
    lat: float, lon: float, *, guidance_value_per_sqm: float | None,
    features: list[dict[str, Any]], as_of: str = "2024-Q4",
) -> dict[str, Any]:
    """Assemble the price-upside RANGE result. See module docstring for the honesty rules."""
    if guidance_value_per_sqm is None:
        return {
            "status": "unresolved",
            "upside": None,
            "guidance_value_per_sqm": None,
            "reason": "no Kaveri guidance value supplied — price upside is UNRESOLVED (not zero). "
            "Provide the sub-registrar guidance value (₹/sqm) for the survey number to resolve.",
        }

    node, distance_m = nearest_qualifying_node(lat, lon, features)
    if node is None or distance_m is None:
        # guidance known but no operational/UC node in the dataset -> a genuine 0 upside (resolved),
        # distinct from the unresolved-missing-guidance case above.
        low_pct, high_pct = 0.0, 0.0
        node_name = node_type = node_status = None
    else:
        low_pct, high_pct = _premium_band(distance_m)
        node_name = node["name"]
        node_type = node["type"]
        node_status = node["status"]

    upside = {
        "low": round(guidance_value_per_sqm * low_pct, 2),
        "high": round(guidance_value_per_sqm * high_pct, 2),
        "unit": "INR/sqm (uplift over guidance value)",
        "node_name": node_name,
        "node_type": node_type,
        "node_status": node_status,
        "node_distance_m": distance_m,
        "premium_low_pct": round(low_pct * 100, 1),
        "premium_high_pct": round(high_pct * 100, 1),
        "method": _METHOD,
        "confidence": "inferred",
        "as_of": as_of,
    }
    return {
        "status": "resolved",
        "upside": upside,
        "guidance_value_per_sqm": guidance_value_per_sqm,
        "reason": None,
    }
