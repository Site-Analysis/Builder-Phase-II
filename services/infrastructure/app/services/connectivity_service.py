# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-086 connectivity — one service owns airport / metro / rail / highway distance + access road.

CONSOLIDATION: the airport-distance logic moved OUT of the planning service (which keeps only the
ICAO/OLS height cap it needs for the envelope) INTO here, so connectivity has one owner.

DISTANCE HONESTY: every distance is labelled `straight-line` vs `network` — never conflated. All
geometry is in EPSG:32643 (UTM 43N metres). Airport distance is straight-line from the bundled AAI
ARP coordinates (authoritative for the ARP point). Metro/rail/highway distances come from real
sources ONLY — if a source is not fetchable in this environment the seam returns `unresolved`; we
NEVER fabricate a distance or hardcode a station coordinate from memory.

ROAD WIDTH: reuses the EXISTING planning road_width_resolver (surveyed > MapTiler-measured >
KGIS-if-probed > lane-estimate > unresolved). This service does NOT reimplement band/tier math — it
consumes the resolver's output and passes its confidence through.

Emits ONE merged connectivity score + access-constraint flags and a `connectivity_signal` (same
shape family as infra_readiness) for the US-092 GO/NO-GO engine.
"""

from __future__ import annotations

import math
from typing import Any

# ── EPSG:32643 (WGS84 → UTM 43N) — repo convention: hand-rolled, no pyproj ──
_A = 6378137.0
_F = 1.0 / 298.257223563
_E2 = _F * (2.0 - _F)
_K0 = 0.9996
_FALSE_EASTING = 500000.0
_LON0 = math.radians(75.0)


def wgs84_to_utm43n(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    ep2 = _E2 / (1.0 - _E2)
    n = _A / math.sqrt(1.0 - _E2 * math.sin(lat) ** 2)
    t = math.tan(lat) ** 2
    c = ep2 * math.cos(lat) ** 2
    a = math.cos(lat) * (lon - _LON0)
    m = _A * (
        (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256) * lat
        - (3 * _E2 / 8 + 3 * _E2**2 / 32 + 45 * _E2**3 / 1024) * math.sin(2 * lat)
        + (15 * _E2**2 / 256 + 45 * _E2**3 / 1024) * math.sin(4 * lat)
        - (35 * _E2**3 / 3072) * math.sin(6 * lat)
    )
    easting = _FALSE_EASTING + _K0 * n * (
        a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * ep2) * a**5 / 120
    )
    northing = _K0 * (
        m + n * math.tan(lat) * (
            a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24
            + (61 - 58 * t + t**2 + 600 * c - 330 * ep2) * a**6 / 720
        )
    )
    return easting, northing


# Bundled AAI aerodrome ARPs (same coordinates already bundled in the geo overlay engine + the
# planning envelope — NOT recalled from memory). Authoritative for the ARP point.
_AIRPORTS: list[dict[str, Any]] = [
    {"name": "Kempegowda International (BLR)", "iata": "BLR", "lat": 13.1979, "lon": 77.7063},
    {"name": "HAL Airport Bengaluru", "iata": "BLR-HAL", "lat": 12.9500, "lon": 77.6632},
    {"name": "Mysuru Airport", "iata": "MYQ", "lat": 12.2333, "lon": 76.6500},
    {"name": "Mangaluru International", "iata": "IXE", "lat": 12.9613, "lon": 74.8900},
    {"name": "Hubballi Airport", "iata": "HBX", "lat": 15.3617, "lon": 75.0849},
    {"name": "Belagavi Airport", "iata": "IXG", "lat": 15.8593, "lon": 74.6183},
    {"name": "Kalaburagi Airport", "iata": "GBI", "lat": 17.5288, "lon": 76.9016},
    {"name": "Shivamogga Airport", "iata": "IXX", "lat": 13.9783, "lon": 75.0369},
]

_NO_METRO_THRESHOLD_M = 5000.0   # "no metro within 5 km" access flag
_NH_PROXIMITY_M = 500.0          # highway-adjacency flag (noise/access)
_NARROW_APPROACH_M = 9.0         # access road narrower than this -> constrained approach

# C4 confidence ladder rank (mirrors packages/confidence; locked by the cross-service guard).
_CONF_RANK = {"authoritative": 3, "derived": 2, "inferred": 1, "unresolved": 0}


def _weakest_conf(confs: list[str]) -> str:
    """Weakest confidence on the C4 ladder (for the merged signal). Empty -> unresolved."""
    return min(confs, key=lambda c: _CONF_RANK.get(c, 0)) if confs else "unresolved"


def airport_connectivity(lat: float, lon: float) -> dict[str, Any]:
    """Nearest bundled AAI aerodrome, STRAIGHT-LINE distance in EPSG:32643 metres."""
    pe, pn = wgs84_to_utm43n(lat, lon)
    best = None
    best_d = math.inf
    for ap in _AIRPORTS:
        ae, an = wgs84_to_utm43n(ap["lat"], ap["lon"])
        d = math.hypot(pe - ae, pn - an)
        if d < best_d:
            best_d, best = d, ap
    return {
        "mode": "airport",
        "status": "resolved",
        "name": best["name"],
        "ref": best["iata"],
        "distance_m": round(best_d, 1),
        "distance_type": "straight-line",   # ARP point, not a road-network distance
        "confidence": "authoritative",       # bundled AAI ARP coordinate
        "crs": "EPSG:32643",
        "data_source": "AAI aerodrome ARPs (bundled)",
        "reason": None,
        "next_action": None,
    }


def transport_seam(
    mode: str, *, fetched: dict | None, source: str, seam_note: str,
) -> dict[str, Any]:
    """A transport-distance seam (metro/rail/highway). `fetched` is a real record
    {name, distance_m, distance_type, confidence} from a fetchable source, or None when the source
    is not reachable in this environment -> `unresolved` (NEVER a fabricated distance)."""
    if fetched is not None:
        return {
            "mode": mode, "status": "resolved",
            "name": fetched.get("name"),
            "ref": fetched.get("ref"),
            "distance_m": fetched.get("distance_m"),
            "distance_type": fetched.get("distance_type", "straight-line"),
            "confidence": fetched.get("confidence", "inferred"),
            "crs": "EPSG:32643",
            "data_source": source,
            "reason": None, "next_action": None,
        }
    return {
        "mode": mode, "status": "unresolved",
        "name": None, "ref": None, "distance_m": None, "distance_type": None,
        "confidence": "unresolved", "crs": "EPSG:32643", "data_source": source,
        "reason": f"{mode} source not fetchable in this environment ({seam_note}) — distance "
        "withheld rather than fabricated.",
        "next_action": f"wire the {mode} source ({seam_note}) then re-run; absence is not proximity.",
    }


def road_width_from_resolver(rw_result: dict | None) -> dict[str, Any]:
    """Consume the planning road_width_resolver's output verbatim (do NOT recompute). Returns the
    access-road width with the resolver's own confidence tier, or unresolved."""
    if not rw_result or rw_result.get("status") != "resolved":
        return {
            "status": "unresolved",
            "value_m": None, "band": None, "confidence": "unresolved",
            "source": "planning road_width_resolver",
            "reason": (rw_result or {}).get("reason", "no road-width tier supplied"),
            "next_action": (rw_result or {}).get(
                "next_action", "measure/survey the access-road width"),
        }
    return {
        "status": "resolved",
        "value_m": rw_result.get("value_m"),
        "band": rw_result.get("band"),
        "confidence": rw_result.get("confidence"),      # resolver's tier passes through
        "source": "planning road_width_resolver",
        "reason": None, "next_action": None,
    }


def merge_connectivity(
    airport: dict, metro: dict, rail: dict, highway: dict, road_width: dict,
) -> dict[str, Any]:
    """One merged connectivity score + access flags + the US-092 connectivity_signal."""
    flags: list[str] = []

    # narrow approach — from the access-road width (resolver tier)
    if road_width["status"] == "resolved":
        w = road_width.get("value_m")
        band = road_width.get("band") or {}
        top = band.get("max")
        if (w is not None and w < _NARROW_APPROACH_M) or (top is not None and top <= _NARROW_APPROACH_M):
            flags.append("narrow-approach")

    # no metro within threshold
    if metro["status"] != "resolved" or (
        metro.get("distance_m") is not None and metro["distance_m"] > _NO_METRO_THRESHOLD_M
    ):
        flags.append("no-metro-within-5km")

    # highway adjacency (access + noise)
    if highway["status"] == "resolved" and highway.get("distance_m") is not None \
            and highway["distance_m"] <= _NH_PROXIMITY_M:
        flags.append("highway-adjacent")

    # merged score: only from RESOLVED components — unresolved lowers confidence, not the number.
    score = 0.0
    if road_width["status"] == "resolved":
        conf = road_width.get("confidence")
        score += 40.0 if conf == "authoritative" else 25.0 if conf in ("inferred", "derived") else 0.0
    if metro["status"] == "resolved" and metro.get("distance_m") is not None:
        score += max(0.0, 30.0 * (1.0 - min(metro["distance_m"], _NO_METRO_THRESHOLD_M) / _NO_METRO_THRESHOLD_M))
    # airport: proximity is a MIXED signal (access good, but noise/OLS bad) — count presence, not closeness
    if airport["status"] == "resolved":
        score += 15.0
    if highway["status"] == "resolved":
        score += 15.0
    raw_score = round(min(100.0, score), 1)

    # ── US-092 C2: known-vs-unknown. DECISION-relevant inputs = metro/rail/highway/road_width
    # (airport is always bundled → context, not decision-critical). An all-unresolved signal must
    # NOT emit a single misleading number: the score is SUPPRESSED (null) and status=unresolved.
    decision = {"metro": metro, "rail": rail, "highway": highway, "road_width": road_width}
    unknowns = [
        {"name": name, "next_action": comp.get("next_action") or f"resolve the {name} source"}
        for name, comp in decision.items() if comp.get("status") != "resolved"
    ]
    unresolved_count = len(unknowns)
    known_decision = len(decision) - unresolved_count
    if unresolved_count == 0:
        status = "resolved"
    elif known_decision == 0:
        status = "unresolved"          # only the bundled airport is known — signal is unknown
    else:
        status = "partial"
    resolved_score = None if status == "unresolved" else raw_score

    # confidence on the C4 ladder: weakest of the RESOLVED components; unresolved when the signal is.
    if status == "unresolved":
        confidence = "unresolved"
    else:
        resolved_confs = [
            m.get("confidence", "unresolved")
            for m in (airport, metro, rail, highway, road_width) if m["status"] == "resolved"
        ]
        confidence = _weakest_conf(resolved_confs)

    overall = "good" if (resolved_score is not None and resolved_score >= 65) else (
        "partial" if status != "unresolved" else "unknown")

    signal = {
        "airport_km": round(airport["distance_m"] / 1000, 2) if airport.get("distance_m") else None,
        "airport_distance_type": airport.get("distance_type"),
        "metro_status": metro["status"],
        "road_width_confidence": road_width.get("confidence"),
        "access_flags": flags,
        "overall": overall,
        "status": status,
        "resolved_score": resolved_score,
        "unresolved_count": unresolved_count,
        "unknowns": unknowns,
        "confidence": confidence,
        "notes": [
            "airport/metro distances are STRAIGHT-LINE (not road-network) unless labelled otherwise.",
            "score is computed over RESOLVED inputs only; unresolved inputs are surfaced in `unknowns`, "
            "never averaged into the number." if unresolved_count else
            "all decision inputs resolved.",
            *([m["reason"] for m in (metro, rail, highway) if m["status"] == "unresolved" and m.get("reason")]),
        ],
    }
    # top-level score mirrors the signal: suppressed (None) when unresolved.
    return {"score": resolved_score, "access_flags": flags, "connectivity_signal": signal}


def build_connectivity(
    lat: float, lon: float, *, metro_fetched: dict | None = None,
    rail_fetched: dict | None = None, highway_fetched: dict | None = None,
    road_width_result: dict | None = None,
) -> dict[str, Any]:
    """Assemble the full connectivity result. Airport is always resolved (bundled). Metro/rail/
    highway resolve only from a real fetched record, else unresolved. Road width comes from the
    planning resolver's output (never recomputed here)."""
    airport = airport_connectivity(lat, lon)
    metro = transport_seam("metro", fetched=metro_fetched,
                           source="BMRCL GTFS / curated pipeline data",
                           seam_note="BMRCL GTFS not fetchable; curated pipeline coords via future-infra")
    rail = transport_seam("rail", fetched=rail_fetched, source="datameet rail stations",
                          seam_note="datameet layer not bundled")
    highway = transport_seam("highway", fetched=highway_fetched,
                             source="data.gov.in / OSM highway ref",
                             seam_note="NH/SH source not fetchable in this environment")
    road_width = road_width_from_resolver(road_width_result)
    merged = merge_connectivity(airport, metro, rail, highway, road_width)
    return {
        "airport": airport, "metro": metro, "rail": rail, "highway": highway,
        "road_width": road_width,
        "connectivity_score": merged["score"],
        "access_flags": merged["access_flags"],
        "connectivity_signal": merged["connectivity_signal"],
        "data_source": "AAI ARPs (bundled) + planning road_width_resolver + metro/rail/highway seams",
    }
