# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-088 — unified deal-killer overlay engine.

Consolidates the rajakaluve/waterbody/flood/forest/airport-OLS/HT-line overlay logic that
was scattered across the geo (water_service), flood, infrastructure and planning services
into ONE dated-config registry. Other services keep their endpoints; this is the single
deal-killer view a future US-092 GO/NO-GO engine reads.

CARDINAL RULE — ABSENCE OF DATA IS NOT ABSENCE OF HAZARD.
    If the layer needed to CLEAR an overlay is not bundled/available, that overlay returns
    `unresolved` — never "G"/clear. A missing wetland layer rendering as "no wetland" is the
    single worst bug this engine can ship (it turns a deal-killer into a false all-clear).
    So: only overlays with a bundled AUTHORITATIVE clearing layer (rajakaluve, airport-OLS)
    can return "G". Every other overlay is PENDING → `unresolved` on absence. A sparse-OSM
    PRESENCE observation may still fire "R" (presence is trustworthy), but OSM SILENCE can
    never yield "G" (silence != absence).

CRS — all distances in EPSG:32643 (UTM 43N metres), never degrees. lat/lon order is asserted
against Karnataka bounds (swap canary) before any projection.

BUFFERS ARE DATED CONFIG, NOT CONSTANTS. Each regime carries buffer_m, reference_point
(centre vs periphery — regimes differ), rule_citation, effective_date, litigation_status.
Where regimes disagree the engine DEFAULTS TO STRICTEST (largest buffer) and exposes the
range; a contested/stayed regime never silently relaxes the number.
"""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path
from typing import Any

from app.models.geo import (
    OverlayItem,
    OverlayProvenance,
    OverlayResult,
    OverlayVerdict,
)
from app.services.water_service import _load_rajakaluve  # bundled BBMP SWD 2022 rajakaluve

# ── EPSG:32643 (WGS84 → UTM zone 43N) forward projection ────────────────────
# Hand-rolled Transverse Mercator (repo convention: no pyproj). Zone 43N central
# meridian = 75°E, which covers Karnataka. Accurate to sub-metre at these scales.
_A = 6378137.0                    # WGS84 semi-major axis (m)
_F = 1.0 / 298.257223563          # flattening
_E2 = _F * (2.0 - _F)             # first eccentricity squared
_K0 = 0.9996
_FALSE_EASTING = 500000.0
_LON0 = math.radians(75.0)        # UTM 43N central meridian

# Karnataka bounding box — the swap canary + KA-only guard.
_KA_LAT = (11.5, 18.5)
_KA_LON = (74.0, 78.6)


def assert_karnataka_latlon(lat: float, lon: float) -> None:
    """Reject swapped lat/lon and out-of-Karnataka points BEFORE projecting.

    A silent lat/lon swap projects to garbage metres and would mis-clear every overlay,
    so this is a hard failure, not a warning.
    """
    if _KA_LON[0] <= lat <= _KA_LON[1] and _KA_LAT[0] <= lon <= _KA_LAT[1] and not (
        _KA_LAT[0] <= lat <= _KA_LAT[1]
    ):
        raise ValueError(
            f"lat/lon appear SWAPPED: lat={lat}, lon={lon} — expected lat in "
            f"{_KA_LAT}, lon in {_KA_LON} for Karnataka"
        )
    if not (_KA_LAT[0] <= lat <= _KA_LAT[1] and _KA_LON[0] <= lon <= _KA_LON[1]):
        raise ValueError(
            f"point ({lat}, {lon}) is outside Karnataka bounds {_KA_LAT}×{_KA_LON}; "
            "the overlay engine is KA-only (bundled layers do not cover elsewhere)"
        )


def wgs84_to_utm43n(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    """(lat, lon) in degrees → (easting, northing) in EPSG:32643 metres."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
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
        m
        + n
        * math.tan(lat)
        * (
            a**2 / 2
            + (5 - t + 9 * c + 4 * c**2) * a**4 / 24
            + (61 - 58 * t + t**2 + 600 * c - 330 * ep2) * a**6 / 720
        )
    )
    return easting, northing


def _seg_dist_m(pe: float, pn: float, ae: float, an: float, be: float, bn: float) -> float:
    """Point→segment distance in projected metres (EPSG:32643)."""
    dx, dy = be - ae, bn - an
    if dx == 0 and dy == 0:
        return math.hypot(pe - ae, pn - an)
    tt = max(0.0, min(1.0, ((pe - ae) * dx + (pn - an) * dy) / (dx * dx + dy * dy)))
    return math.hypot(pe - (ae + tt * dx), pn - (an + tt * dy))


# ── runtime polygon-layer loader (GeoJSON ONLY — no parquet/WKB at runtime) ──
# US-088 stage-2: the KA-sliced deal-killer layers produced by
# scripts/prep_overlay_layers.py. Loaded once + bbox-indexed. A MISSING file returns None
# from the probe -> the overlay stays `unresolved` (CARDINAL RULE: absence != clear).
_DATA = Path(__file__).parent.parent / "data"
_LAYER_CACHE: dict[str, list[tuple[tuple[float, float, float, float], list]] | None] = {}


def _to_polygons(geom: dict[str, Any] | None) -> list[list[list[list[float]]]]:
    """Normalize a GeoJSON geometry to a list of polygons, each = [exterior_ring, *holes]."""
    if not geom:
        return []
    t = geom.get("type")
    c = geom.get("coordinates")
    if t == "Polygon":
        return [c]
    if t == "MultiPolygon":
        return list(c)
    return []


def _load_polygon_layer(fname: str):
    """Lazily load + bbox-index a KA-sliced GeoJSON polygon layer. Returns None if the file is
    absent (gitignored + not yet prepped) — the caller MUST then return `unresolved`."""
    if fname in _LAYER_CACHE:
        return _LAYER_CACHE[fname]
    path = _DATA / fname
    if not path.exists():
        _LAYER_CACHE[fname] = None
        return None
    fc = json.loads(path.read_text(encoding="utf-8"))
    feats: list[tuple[tuple[float, float, float, float], list]] = []
    for f in fc.get("features", []):
        polys = _to_polygons(f.get("geometry"))
        if not polys:
            continue
        xs = [pt[0] for poly in polys for ring in poly for pt in ring]
        ys = [pt[1] for poly in polys for ring in poly for pt in ring]
        feats.append(((min(xs), min(ys), max(xs), max(ys)), polys))
    _LAYER_CACHE[fname] = feats
    return feats


def _point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-cast point-in-polygon on a [lon, lat] ring (degrees)."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        ):
            inside = not inside
        j = i
    return inside


def _probe_polygon_layer(
    fname: str, pe: float, pn: float, lat: float, lon: float, *, pad: float = 0.02
) -> dict[str, Any] | None:
    """Nearest-edge distance (EPSG:32643 m) + inside flag for a KA polygon layer, or None if
    the layer file is absent. `pad` (degrees) is the bbox prefilter halo — must exceed the
    largest buffer we test (~2.2 km >> the ≤100 m overlay buffers)."""
    feats = _load_polygon_layer(fname)
    if feats is None:
        return None
    inside = False
    best: float | None = None
    for (minx, miny, maxx, maxy), polys in feats:
        if lon < minx - pad or lon > maxx + pad or lat < miny - pad or lat > maxy + pad:
            continue
        for poly in polys:
            if poly and _point_in_ring(lon, lat, poly[0]):
                inside = True
            for ring in poly:
                for i in range(len(ring) - 1):
                    ae, an = wgs84_to_utm43n(ring[i][1], ring[i][0])
                    be, bn = wgs84_to_utm43n(ring[i + 1][1], ring[i + 1][0])
                    d = _seg_dist_m(pe, pn, ae, an, be, bn)
                    if best is None or d < best:
                        best = d
    return {"inside": inside, "distance_m": 0.0 if inside else best}


# ── AAI airports (Karnataka + majors) — bundled coords for the OLS overlay ──
_AIRPORTS: list[dict[str, Any]] = [
    {"name": "Kempegowda International (BLR)", "lat": 13.1979, "lon": 77.7063},
    {"name": "HAL Airport Bengaluru", "lat": 12.9500, "lon": 77.6632},
    {"name": "Mysuru Airport", "lat": 12.2333, "lon": 76.6500},
    {"name": "Mangaluru International", "lat": 12.9613, "lon": 74.8900},
    {"name": "Hubballi Airport", "lat": 15.3617, "lon": 75.0849},
    {"name": "Belagavi Airport", "lat": 15.8593, "lon": 74.6183},
    {"name": "Kalaburagi Airport", "lat": 17.5288, "lon": 76.9016},
    {"name": "Shivamogga Airport", "lat": 13.9783, "lon": 75.0369},
]

_DISCLAIMER = (
    "Deal-killer overlays. Distances in EPSG:32643 (UTM 43N metres). Buffers are the STRICTEST "
    "applicable dated regime; where regimes are in legal flux the range is exposed. Any overlay "
    "whose clearing layer is not bundled returns 'unresolved' — NOT clear (absence of data is "
    "NOT absence of hazard). Not a substitute for a licensed survey / statutory NOC."
)


# ── dated-config regime registry ────────────────────────────────────────────
# reference_point: 'centre' = measured from feature centreline; 'periphery' = from its edge/FTL.
def _rajakaluve_regimes() -> list[dict[str, Any]]:
    return [
        {
            "buffer_m": 50.0, "reference_point": "centre",
            "rule_citation": "RMP-2015 reg 4.12.2(ii), p.40 (primary rajakaluve — 50 m, measured "
            "from the centre; secondary 25 m, tertiary 15 m)",
            "effective_date": "2017-05-25", "litigation_status": "settled",
        },
        {
            "buffer_m": 50.0, "reference_point": "periphery",
            "rule_citation": "Karnataka HC WP 817/2008 (50 m primary, NGT-affirmed — from edge)",
            "effective_date": "2016-05-04", "litigation_status": "settled",
        },
        {
            "buffer_m": 30.0, "reference_point": "centre",
            "rule_citation": "RMP draft amendment 2025 (proposed reduction to 30 m) — NOT in force",
            "effective_date": "2025-11-01", "litigation_status": "proposed",
        },
    ]


def _strictest(regimes: list[dict[str, Any]]) -> dict[str, Any]:
    """Pick the governing (strictest) regime = largest buffer; tie → periphery (more
    conservative reference), and only among IN-FORCE regimes (proposed/stayed excluded from
    governing but still surfaced in the range)."""
    in_force = [r for r in regimes if r["litigation_status"] not in ("proposed", "stayed")]
    pool = in_force or regimes
    return max(pool, key=lambda r: (r["buffer_m"], r["reference_point"] == "periphery"))


def _regime_summary(regimes: list[dict[str, Any]]) -> dict[str, Any]:
    gov = _strictest(regimes)
    buffers = sorted({r["buffer_m"] for r in regimes})
    contested = len(buffers) > 1 or any(
        r["litigation_status"] in ("contested", "stayed", "proposed") for r in regimes
    )
    return {
        "buffer_m": gov["buffer_m"],
        "buffer_range_m": [buffers[0], buffers[-1]] if len(buffers) > 1 else None,
        "reference_point": gov["reference_point"],
        "rule_citation": gov["rule_citation"],
        "effective_date": gov["effective_date"],
        "litigation_status": "contested" if contested else gov["litigation_status"],
    }


# ── LIVE polygon overlays (US-088 stage-2) — KA-sliced layers via prep script ──
# Each reads a *_ka.geojson. status R if the point is INSIDE a feature OR within the strictest
# buffer; G otherwise (the layer covers KA, so it can now CLEAR). File ABSENT → `unresolved`
# (cardinal rule). confidence stays `inferred` on OUR ladder — national datasets, not the
# sanctioning authority's parcel record; do NOT promote.
_POLYGON_LIVE: list[dict[str, Any]] = [
    {
        "name": "wetland", "fname": "wetlands_ka.geojson",
        # NO groundable blanket buffer: the Wetlands (Conservation & Management) Rules 2017 bar
        # activities WITHIN a notified wetland + its "zone of influence" but set NO statutory
        # metric distance (buffer is fixed case-by-case by the wetland authority / NGT). So this
        # is an inside/outside overlay (buffer_m 0.0) — an invented 100 m would be fabrication.
        "regimes": [
            {"buffer_m": 0.0, "reference_point": "periphery",
             "rule_citation": "Wetlands (Conservation & Management) Rules 2017 — activity barred "
             "WITHIN a notified wetland; NO statutory blanket buffer distance (site-specific)",
             "effective_date": "2017-09-26", "litigation_status": "settled"},
        ],
        "source": "Bharatmaps Parivesh / MoEFCC Wetland Rules 2017 (bharatlas, CC0)",
        "inside_reason": "site inside a mapped wetland (Wetland Rules 2017 — activity barred).",
        "next_action": "wetland boundaries are indicative (national layer, inferred tier) — "
        "confirm the notified extent + any authority/NGT buffer with the KA State Wetland "
        "Authority before any construction.",
    },
    {
        "name": "wetland-ramsar", "fname": "ramsar_wetlands_ka.geojson",
        # Same as wetland: no groundable metric buffer. Higher severity (internationally
        # designated), but the distance is NOT invented — inside/outside only.
        "regimes": [
            {"buffer_m": 0.0, "reference_point": "periphery",
             "rule_citation": "Ramsar Convention site + Wetland Rules 2017 — internationally "
             "designated, activity barred within; NO statutory blanket buffer distance "
             "(HIGHER severity than a general wetland)",
             "effective_date": "2017-09-26", "litigation_status": "settled"},
        ],
        "source": "Bharatmaps Parivesh Ramsar Wetlands (bharatlas, CC0)",
        "inside_reason": "site inside a RAMSAR wetland — internationally protected, treat as a "
        "hard deal-killer.",
        "next_action": "Ramsar sites carry the strictest protection — a formal ecological "
        "clearance is required; verify the notified boundary + buffer with MoEFCC.",
    },
    {
        "name": "forest", "fname": "forests_ka.geojson",
        "regimes": [
            {"buffer_m": 0.0, "reference_point": "periphery",
             "rule_citation": "Reserved/Protected Forest boundary (Survey of India) — no "
             "construction inside; the ESZ buffer is a SEPARATE overlay",
             "effective_date": None, "litigation_status": "settled"},
        ],
        "source": "Survey of India forest boundaries (bharatlas, CC0)",
        "inside_reason": "site inside a Survey-of-India forest boundary (Forest Conservation "
        "Act) — construction barred.",
        "next_action": "forest boundary is indicative (SOI national layer) — confirm with the "
        "KA Forest Dept; diversion needs FCA clearance.",
    },
    {
        "name": "eco-sensitive-zone", "fname": "eco_sensitive_zones_ka.geojson",
        "regimes": [
            {"buffer_m": 0.0, "reference_point": "periphery",
             "rule_citation": "Eco-Sensitive Zone (MoEFCC notification) — regulated activity "
             "zone; the exact buffer is per-site notification (SEPARATE from reserved forest)",
             "effective_date": None, "litigation_status": "contested"},
        ],
        "source": "Bharatmaps / MoEFCC Eco-Sensitive Zones (bharatlas, CC0)",
        "inside_reason": "site inside a notified Eco-Sensitive Zone — activity is regulated "
        "(the ESZ notification governs permitted uses).",
        "next_action": "read the specific ESZ notification for the permitted-activity list + "
        "the zonal master plan.",
    },
    {
        "name": "flood", "fname": "flood_inundation_ka.geojson",
        # US-089 Part 1 — NDEM satellite-observed inundation 1998-2022. EVIDENCE OF PAST FLOODING,
        # not a predictive flood zone. Pure intersect (no buffer). ABSENCE SEMANTICS (honest): a
        # parcel NOT intersecting is NOT "clear" — it means "no observed inundation in THIS record"
        # (a 25-yr satellite record misses unobserved/localised/future events). So absence → AMBER
        # (A), never G. File absent → unresolved (cardinal rule).
        "regimes": [
            {"buffer_m": 0.0, "reference_point": "periphery",
             "rule_citation": "NDEM flood inundation 1998-2022 (NRSC/ISRO) — satellite-observed "
             "historical inundation extent; evidence of past flooding, NOT a predictive flood zone",
             "effective_date": "1998-01-01", "litigation_status": "settled"},
        ],
        "source": "NDEM flood inundation 1998-2022 (NRSC/ISRO, bharatlas, CC0)",
        "vintage": "1998-2022",
        "absence_status": "A",
        "absence_reason": "no observed inundation in the NDEM 1998-2022 record at this parcel — "
        "this is NOT a flood clearance: the record is a 25-yr satellite observation that can miss "
        "unobserved, localised, drainage-failure or future flooding. Treat as caution, not clear.",
        "absence_next_action": "cross-check the /flood elevation+rainfall score and a local drainage "
        "survey; historical non-observation does not certify the site as flood-safe.",
        "inside_reason": "parcel intersects a satellite-observed flood inundation polygon "
        "(NDEM 1998-2022) — the site FLOODED in the observed record.",
        "next_action": "treat as a flood-prone site: commission a hydrological study; elevate "
        "plinth; confirm the inundation year/return-period with NRSC Bhuvan.",
    },
    {
        "name": "lakes/waterbodies", "fname": "lakes_ka.geojson",
        # Multi-regime, strictest governs (same shape as rajakaluve). NGT 75 m is the strictest
        # in-force → governs; RMP 30 m + KTCDA 30 m are in force but looser; the KTCDA-2025
        # size-based relaxation is a DRAFT (proposed) → surfaced in the range, never governs.
        "regimes": [
            {"buffer_m": 75.0, "reference_point": "periphery",
             "rule_citation": "NGT — 75 m lake buffer (Forward Foundation / Mavallipura orders, "
             "Bengaluru lakes) — strictest in force",
             "effective_date": "2016-05-04", "litigation_status": "settled"},
            {"buffer_m": 30.0, "reference_point": "periphery",
             "rule_citation": "RMP-2015 reg 4.12.2(ii)(iii), p.40 — 30 m 'no development zone' "
             "around a lake (as per revenue records)",
             "effective_date": "2017-05-25", "litigation_status": "settled"},
            {"buffer_m": 30.0, "reference_point": "periphery",
             "rule_citation": "KTCDA Act 2014 — 30 m tank/lake buffer",
             "effective_date": "2014-01-01", "litigation_status": "settled"},
            {"buffer_m": 30.0, "reference_point": "periphery",
             "rule_citation": "KTCDA Amendment 2025 — size-based 0–30 m relaxation (DRAFT — "
             "confirm notified vs draft; NOT in force, does not govern)",
             "effective_date": "2025-01-01", "litigation_status": "proposed"},
        ],
        "source": "CWC WRIS lakes (bharatlas, CC0)",
        "inside_reason": "site inside / within the strictest in-force lake buffer (NGT 75 m).",
        "next_action": "lake extent is the WRIS national layer (inferred) — survey the Full "
        "Tank Level; a proposed KTCDA-2025 relaxation must not be relied on until notified.",
    },
]

# PENDING overlays: still no bundled clearing layer → unresolved on absence. A trustworthy
# PRESENCE observation may fire RED, but silence can never clear one.
_PENDING_SPECS: list[dict[str, Any]] = [
    {
        "name": "HT-line", "reference_point": "centre",
        "regimes": [
            {"buffer_m": 15.0, "reference_point": "centre",
             "rule_citation": "CEA (Measures relating to Safety & Electric Supply) Regs 2010 — "
             "horizontal ROW clearance (voltage-dependent; 220 kV ≈ 15 m)",
             "effective_date": "2010-01-01", "litigation_status": "settled"},
        ],
        "source": "HT transmission geometry (bharatlas/OSM power=line) — NOT bundled",
        "reason": "HT-line geometry not bundled; a nearby line is a hard clearance constraint and "
        "OSM silence cannot clear it. Rule-only until geometry loads.",
        "next_action": "load HT transmission lines; apply the CEA voltage-specific vertical + "
        "horizontal clearance on survey.",
    },
    {
        "name": "gas", "reference_point": "centre",
        "regimes": [
            {"buffer_m": 15.0, "reference_point": "centre",
             "rule_citation": "PNGRB T4S — min 15 m from a natural-gas pipeline",
             "effective_date": None, "litigation_status": "settled"},
        ],
        "source": "gas pipeline geometry — no public dataset (rule-only)",
        "reason": "no public gas-pipeline geometry exists; this is a rule-only constraint and "
        "cannot be cleared from data.",
        "next_action": "confirm with GAIL/city gas distributor before design.",
    },
]


def _airport_ols(pe: float, pn: float, building_height_m: float | None) -> dict[str, Any]:
    """Nearest AAI aerodrome + ICAO Annex 14 obstacle-limitation height cap. LIVE (bundled
    ARP coords are authoritative for major aerodromes → can clear). OLS restricts HEIGHT; it
    is a hard NO-GO ('R') only when a supplied building height pierces the cap, else AMBER
    within the surfaces, GREEN outside the outer horizontal (15 km)."""
    best_d = math.inf
    best_name = None
    for ap in _AIRPORTS:
        ae, an = wgs84_to_utm43n(ap["lat"], ap["lon"])
        d = math.hypot(pe - ae, pn - an)
        if d < best_d:
            best_d, best_name = d, ap["name"]
    # ICAO surfaces (approx, Code-4): inner approach 15 m cap <500 m; inner horizontal 45 m
    # <4 km; conical to 155 m to 7 km; outer horizontal 155 m to 15 km; none beyond.
    if best_d < 500:
        cap, surface = 15.0, "Inner Approach Surface"
    elif best_d < 4000:
        cap, surface = 45.0, "Inner Horizontal Surface"
    elif best_d < 7000:
        cap, surface = 45.0 + (best_d - 4000) * 0.05, "Conical Surface"
    elif best_d < 15000:
        cap, surface = 155.0, "Outer Horizontal Surface"
    else:
        cap, surface = None, "No OLS restriction"
    if cap is None:
        status = "G"
    elif building_height_m is not None and building_height_m > cap:
        status = "R"      # supplied height pierces the OLS → hard obstacle
    else:
        status = "A"      # inside an OLS surface → height-limited, verify AAI NOCAS
    return {
        "distance_m": round(best_d, 1), "buffer_m": 15000.0, "status": status,
        "reference_point": "centre",
        "rule_citation": f"ICAO Annex 14 {surface} — height cap "
        + (f"{cap:.0f} m" if cap is not None else "none")
        + f" (nearest: {best_name})",
        "effective_date": "2016-01-01", "litigation_status": "settled",
    }


def evaluate_overlays(
    lat: float,
    lon: float,
    *,
    building_height_m: float | None = None,
    observations: dict[str, float] | None = None,
    as_of: str | None = None,
) -> OverlayResult:
    """Evaluate every deal-killer overlay for a point.

    `observations` maps a PENDING overlay name → an externally-probed nearest distance (m),
    e.g. a sparse-OSM presence. It can only PUSH an overlay to 'R' (presence within buffer);
    it can NEVER clear one to 'G' (absence != clear) — that stays 'unresolved'.
    """
    assert_karnataka_latlon(lat, lon)
    pe, pn = wgs84_to_utm43n(lat, lon)
    obs = observations or {}
    as_of = as_of or date.today().isoformat()
    items: list[OverlayItem] = []
    live: list[str] = []
    pending: list[str] = []

    # ── LIVE: rajakaluve (bundled BBMP SWD geometry → authoritative clearing layer) ──
    reg = _regime_summary(_rajakaluve_regimes())
    raja_d = _nearest_rajakaluve_utm(pe, pn, lat, lon)
    if raja_d is None:
        # No bundled feature within prefilter range near a KA point => outside the mapped
        # network. Bundled coverage is city-scale; honestly this is 'unresolved', not clear.
        items.append(_item(
            "rajakaluve/drains", "unresolved", None, reg, as_of,
            OverlayProvenance(source="BBMP SWD 2022 (KSRSAC via OpenCity)",
                              confidence="unresolved", vintage="2022"),
            reason="no primary rajakaluve within the bundled-network prefilter; the bundled "
            "layer is Bengaluru-scale, so absence here is unresolved, not clear.",
            next_action="verify against the BBMP raja-kaluve GIS + a physical survey.",
        ))
    else:
        status = "R" if raja_d <= reg["buffer_m"] else (
            "A" if reg["buffer_range_m"] and raja_d <= reg["buffer_range_m"][1] else "G"
        )
        items.append(_item(
            "rajakaluve/drains", status, round(raja_d, 1), reg, as_of,
            OverlayProvenance(source="BBMP primary SWD 2022 (KSRSAC via OpenCity)",
                              confidence="authoritative", vintage="2022"),
        ))
    live.append("rajakaluve/drains")

    # ── LIVE: airport-OLS (bundled ARP coords → authoritative) ──
    ols = _airport_ols(pe, pn, building_height_m)
    items.append(OverlayItem(
        name="airport-OLS", status=ols["status"], distance_m=ols["distance_m"],
        buffer_m=ols["buffer_m"], reference_point=ols["reference_point"],
        rule_citation=ols["rule_citation"], effective_date=ols["effective_date"],
        litigation_status=ols["litigation_status"], as_of=as_of,
        provenance=OverlayProvenance(source="AAI aerodrome ARPs + ICAO Annex 14",
                                     confidence="authoritative", vintage="2016"),
        reason=None if ols["status"] != "A" else "inside an OLS surface — height-limited; "
        "verify the exact cap via AAI NOCAS before design.",
        next_action=None if ols["status"] == "G" else "obtain AAI height NOC (NOCAS).",
    ))
    live.append("airport-OLS")

    # ── LIVE polygon layers (KA-sliced) — can now CLEAR; missing file → unresolved ──
    for spec in _POLYGON_LIVE:
        sreg = _regime_summary(spec["regimes"])
        probe = _probe_polygon_layer(spec["fname"], pe, pn, lat, lon)
        if probe is None:
            # CARDINAL RULE: layer file absent → unresolved, NOT clear.
            pending.append(spec["name"])
            items.append(_item(
                spec["name"], "unresolved", None, sreg, as_of,
                OverlayProvenance(source=spec["source"], confidence="unresolved", vintage=None),
                reason=f"{spec['fname']} not present — run scripts/prep_overlay_layers.py; "
                "absence of the layer is NOT absence of hazard.",
                next_action="prep the KA overlay layers on setup, then re-run.",
            ))
            continue
        live.append(spec["name"])
        prov = OverlayProvenance(source=spec["source"], confidence="inferred",
                                 vintage=spec.get("vintage", "2024"))
        d = probe["distance_m"]
        hit = probe["inside"] or (d is not None and d <= sreg["buffer_m"])
        # Absence status is per-spec: most layers CLEAR to G, but flood absence is only AMBER —
        # "no observed inundation" is weaker than "clear" (absence != safe).
        absence_status = spec.get("absence_status", "G")
        items.append(_item(
            spec["name"], "R" if hit else absence_status,
            None if d is None else round(d, 1), sreg, as_of, prov,
            reason=spec["inside_reason"] if hit else spec.get("absence_reason"),
            next_action=spec["next_action"] if hit else spec.get("absence_next_action"),
        ))

    # ── PENDING: no bundled clearing layer → unresolved (presence-only R via observation) ──
    for spec in _PENDING_SPECS:
        pending.append(spec["name"])
        sreg = _regime_summary(spec["regimes"])
        prov = OverlayProvenance(source=spec["source"], confidence="unresolved", vintage=None)
        observed = obs.get(spec["name"])
        if observed is not None and observed <= sreg["buffer_m"]:
            # Trustworthy PRESENCE within buffer → RED even though the layer can't CLEAR.
            items.append(_item(
                spec["name"], "R", round(observed, 1), sreg, as_of, prov,
                reason="observed feature within the strictest buffer (presence is trusted; "
                "absence still could not clear this overlay).",
                next_action=spec["next_action"],
            ))
        else:
            items.append(_item(
                spec["name"], "unresolved", None, sreg, as_of, prov,
                reason=spec["reason"], next_action=spec["next_action"],
            ))

    red = [i.name for i in items if i.status == "R"]
    unres = [i.name for i in items if i.status == "unresolved"]
    verdict = OverlayVerdict(
        hard_no_go=bool(red),
        blocks_clean_go=bool(unres),
        red_overlays=red,
        unresolved_overlays=unres,
    )
    return OverlayResult(
        lat=lat, lon=lon, overlays=items, verdict=verdict,
        live_overlays=live, pending_overlays=pending, data_disclaimer=_DISCLAIMER,
    )


def _item(
    name: str, status: str, distance_m: float | None, reg: dict[str, Any], as_of: str,
    prov: OverlayProvenance, *, reason: str | None = None, next_action: str | None = None,
) -> OverlayItem:
    return OverlayItem(
        name=name, status=status, distance_m=distance_m, buffer_m=reg["buffer_m"],
        buffer_range_m=reg["buffer_range_m"], reference_point=reg["reference_point"],
        rule_citation=reg["rule_citation"], effective_date=reg["effective_date"],
        litigation_status=reg["litigation_status"], as_of=as_of, provenance=prov,
        reason=reason, next_action=next_action,
    )


def _nearest_rajakaluve_utm(pe: float, pn: float, lat: float, lon: float) -> float | None:
    """Nearest bundled primary rajakaluve, distance in EPSG:32643 metres (or None if none
    near). Degree-space bbox prefilter (cheap) then project the candidate segment endpoints."""
    feats = _load_rajakaluve()
    if not feats:
        return None
    pad = 0.03  # ~3 km prefilter in degrees
    best: float | None = None
    for (minlon, minlat, maxlon, maxlat), coords in feats:
        if lon < minlon - pad or lon > maxlon + pad or lat < minlat - pad or lat > maxlat + pad:
            continue
        for i in range(len(coords) - 1):
            ae, an = wgs84_to_utm43n(coords[i][1], coords[i][0])
            be, bn = wgs84_to_utm43n(coords[i + 1][1], coords[i + 1][0])
            d = _seg_dist_m(pe, pn, ae, an, be, bn)
            if best is None or d < best:
                best = d
    return best
