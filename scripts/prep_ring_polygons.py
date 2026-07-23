# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""DEV-TIME prep (US-082 Part 1): build the RMP planning-ring polygons from OSM.

Produces ``services/geo/app/data/ka_rings.geojson`` — a FeatureCollection of up to three closed
Polygon features tagged ``role: core | outer | lpa`` (Core Ring Road, Outer Ring Road, and a
municipal-boundary LPA proxy). The runtime (``ring_service``) is GeoJSON-ONLY and NEVER fetches
OSM; this script is the only network step.

HONESTY GUARANTEES (same accuracy contract as the overlay prep):
  * a ring is written ONLY if its geometry closes reliably (stitched endpoints meet within
    ``_CLOSE_TOL_M`` and the ring encloses a plausible area). A ring that does not close is
    OMITTED — never patched shut, never approximated with a circle. The runtime then returns
    `unresolved` for the ring that needed it.
  * every polygon is OSM-derived -> the runtime confidence is always `inferred`.

Run:  python scripts/prep_ring_polygons.py
Deps: stdlib only (urllib). Requires network (Overpass).
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import sys
import urllib.request
from pathlib import Path

_OVERPASS_ENDPOINTS = [
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
_OUT = Path(__file__).resolve().parents[1] / "services" / "geo" / "app" / "data" / "ka_rings.geojson"
_CLOSE_TOL_M = 250.0   # stitched ring endpoints must meet within this to count as "closed"
_MIN_AREA_KM2 = 5.0    # a plausible enclosed ring (Core Ring is small; reject slivers)

# Bengaluru bbox for the Overpass area filter (S,W,N,E).
_BBOX = (12.80, 77.40, 13.20, 77.80)


def _q(named: str) -> str:
    s, w, n, e = _BBOX
    return f"""
[out:json][timeout:120];
(
  way["name"="{named}"]({s},{w},{n},{e});
);
out geom;
"""


def _q_boundary(name: str) -> str:
    return f"""
[out:json][timeout:120];
(
  relation["boundary"="administrative"]["name"="{name}"];
);
out geom;
"""


def _fetch(query: str) -> dict:
    last: Exception | None = None
    for ep in _OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(
                ep, data=query.encode(),
                headers={"User-Agent": "SAT-SiteAnalysisTool/1.0 (US-082 prep)"},
            )
            with urllib.request.urlopen(req, timeout=180) as r:  # noqa: S310
                return json.loads(r.read())
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"    endpoint {ep} failed ({exc}); trying next ...")
    raise last if last else RuntimeError("no Overpass endpoint")


def _hav_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine metres between (lon,lat) points."""
    R = 6371000.0
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dphi = math.radians(b[1] - a[1])
    dlam = math.radians(b[0] - a[0])
    h = math.sin(dphi / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _ways_from(elements: list[dict]) -> list[list[list[float]]]:
    """Each way's geometry as a [[lon,lat],...] line."""
    ways = []
    for el in elements:
        if el.get("type") == "way" and el.get("geometry"):
            ways.append([[g["lon"], g["lat"]] for g in el["geometry"]])
    return ways


def _stitch(ways: list[list[list[float]]]) -> list[list[float]] | None:
    """Greedy-stitch line segments into ONE ordered ring. Returns the closed ring
    ([...,first==last]) if the endpoints meet within tolerance, else None."""
    if not ways:
        return None
    segs = [list(w) for w in ways if len(w) >= 2]
    if not segs:
        return None
    chain = segs.pop(0)
    progressed = True
    while segs and progressed:
        progressed = False
        end = tuple(chain[-1])
        best_i, best_flip, best_d = None, False, _CLOSE_TOL_M
        for i, s in enumerate(segs):
            d0, d1 = _hav_m(end, tuple(s[0])), _hav_m(end, tuple(s[-1]))
            if d0 <= best_d:
                best_i, best_flip, best_d = i, False, d0
            if d1 <= best_d:
                best_i, best_flip, best_d = i, True, d1
        if best_i is not None:
            s = segs.pop(best_i)
            if best_flip:
                s = list(reversed(s))
            chain.extend(s[1:])
            progressed = True
    # closed?
    if _hav_m(tuple(chain[0]), tuple(chain[-1])) <= _CLOSE_TOL_M:
        chain = chain + [chain[0]]  # force exact closure
        return chain
    return None


def _ring_from_boundary(elements: list[dict]) -> list[list[float]] | None:
    """A boundary relation's outer members stitched to a closed ring."""
    ways = []
    for el in elements:
        if el.get("type") == "relation":
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and m.get("role") in ("outer", ""):
                    ways.append([[g["lon"], g["lat"]] for g in m["geometry"]])
    if not ways:
        ways = _ways_from(elements)
    return _stitch(ways)


def _ring_area_km2(ring: list[list[float]]) -> float:
    """Shoelace on an equirectangular projection at the ring's mean latitude -> km²."""
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    R = 6371.0
    pts = [(math.radians(p[0]) * math.cos(lat0) * R, math.radians(p[1]) * R) for p in ring]
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(a) / 2.0


def _feature(role: str, ring: list[list[float]], name: str) -> dict:
    return {
        "type": "Feature",
        "properties": {"role": role, "name": name, "source": "OSM (Overpass)",
                       "area_km2": round(_ring_area_km2(ring), 2)},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def _try_ring(role: str, name: str, query: str, *, boundary: bool) -> dict | None:
    print(f"  fetching {role}: {name!r} ...", flush=True)
    try:
        data = _fetch(query)
    except Exception as exc:  # noqa: BLE001
        print(f"    FETCH FAILED: {exc}")
        return None
    els = data.get("elements", [])
    ring = _ring_from_boundary(els) if boundary else _stitch(_ways_from(els))
    if ring is None:
        print(f"    could NOT close a ring for {role} — OMITTED (runtime -> unresolved).")
        return None
    area = _ring_area_km2(ring)
    if area < _MIN_AREA_KM2:
        print(f"    ring area {area:.1f} km² < {_MIN_AREA_KM2} — implausible, OMITTED.")
        return None
    print(f"    closed {role}: {len(ring)} pts, {area:.1f} km².")
    return _feature(role, ring, name)


def main() -> int:
    print("US-082 ring prep — building RMP planning-ring polygons from OSM")
    feats = []
    specs = [
        ("core", "Core Ring Road", _q("Core Ring Road"), False),
        ("outer", "Outer Ring Road", _q("Outer Ring Road"), False),
        ("lpa", "Bruhat Bengaluru Mahanagara Palike", _q_boundary("Bruhat Bengaluru Mahanagara Palike"), True),
    ]
    for role, name, query, boundary in specs:
        f = _try_ring(role, name, query, boundary=boundary)
        if f:
            feats.append(f)
    if not feats:
        print("NO rings closed — not writing a file. Runtime will return `unresolved` for ring.")
        return 1
    fc = {
        "type": "FeatureCollection",
        "properties": {
            "built": _dt.date.today().isoformat(),
            "source": "OpenStreetMap (Overpass)",
            "note": "OSM-derived RMP planning rings (inferred). LPA is a municipal-boundary proxy.",
            "roles_present": sorted(f["properties"]["role"] for f in feats),
        },
        "features": feats,
    }
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(json.dumps(fc), encoding="utf-8")
    print(f"wrote {_OUT} — roles: {fc['properties']['roles_present']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
