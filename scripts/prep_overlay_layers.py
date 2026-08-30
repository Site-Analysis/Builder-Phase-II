# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-088 STAGE 1 — dev/setup-time prep for the deal-killer overlay layers.

Slices five INDIA-WIDE / KA open-data source layers down to Karnataka and converts them to
runtime-friendly EPSG:4326 [lon, lat] GeoJSON. The geo SERVICE stays GeoJSON-only — this
script is the ONLY place parquet/WKB is read (dev-time deps: pyarrow, shapely, ijson).

Geometry decoding: **shapely** (`shapely.wkb.loads` + `shapely.geometry.mapping`). Chosen over
a hand-rolled WKB parser because the wetland/forest layers are 200k+ MultiPolygons and shapely's
WKB reader is battle-tested for endianness / geometry-type / ring edge cases; a bespoke parser
would be a correctness risk across that volume. Runtime is unaffected (no new geo-service import).

KA slice: source layers have NO state column (except wris_lakes), so slice by BOUNDING BOX
(lat 11.5–18.5, lon 74.0–78.6). Parquets pre-filter cheaply on their xmin/ymin/xmax/ymax columns,
then CONFIRM by geometry (representative point in KA). SOI_Forests (257 MB) is STREAM-parsed with
ijson — never loaded whole. Every output is re-validated (count, CRS, KA-bounds swap canary).

Usage:
    python scripts/prep_overlay_layers.py                 # prep all 5, from ~/Downloads
    python scripts/prep_overlay_layers.py --src-dir DIR   # source dir override
    python scripts/prep_overlay_layers.py --only lakes    # one layer
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
_OUT = _ROOT / "services" / "geo" / "app" / "data"

# Karnataka bounding box — the slice window AND the post-write canary.
_KA_LAT = (11.5, 18.5)
_KA_LON = (74.0, 78.6)


def _in_ka(lon: float, lat: float) -> bool:
    return _KA_LON[0] <= lon <= _KA_LON[1] and _KA_LAT[0] <= lat <= _KA_LAT[1]


def _bbox_hits_ka(xmin: float, ymin: float, xmax: float, ymax: float) -> bool:
    return xmax >= _KA_LON[0] and xmin <= _KA_LON[1] and ymax >= _KA_LAT[0] and ymin <= _KA_LAT[1]


# ── per-layer source config ─────────────────────────────────────────────────
# props: source field -> output field. All licences CC0, vintage 2024.
_PARQUET_LAYERS = {
    "wetlands_ka": {
        "src": "bp_wetlands.parquet",
        "props": {"wetname": "wetname", "level1": "level1", "level2": "level2",
                  "level3": "level3", "areaha": "areaha", "wetcode": "wetcode"},
        "already_ka": False,
        "source": "Bharatmaps Parivesh (MoEFCC Wetland Rules 2017)",
    },
    "lakes_ka": {
        "src": "wris_lakes.parquet",
        "props": {"district": "district", "area_ha": "area_ha", "wbname": "wbname",
                  "objectid": "objectid"},
        "already_ka": True,   # state='KA' already — convert only, still canary-checked
        "source": "CWC WRIS lakes",
    },
}
_GEOJSON_WHOLE = {  # small India-wide layers — safe to load whole, filter by geometry
    "eco_sensitive_zones_ka": {
        "src": "Bharatmaps_Parivesh_Eco_Sensitive_Zones.geojson",
        "props": ["Name", "Zone_Type", "Main_Zone_", "Sub_Zone_T"],
        "source": "Bharatmaps / MoEFCC Eco-Sensitive Zones",
    },
    "ramsar_wetlands_ka": {
        "src": "Bharatmaps_Parivesh_Ramsar_Wetlands.geojson",
        "props": ["name", "district", "state"],
        "source": "Bharatmaps Parivesh Ramsar Wetlands",
    },
}
_FOREST_LAYER = {
    "forests_ka": {
        "src": "SOI_Forests.geojson",  # 257 MB — STREAM only
        "props": ["type", "fcode", "name", "addl_info"],
        "source": "Survey of India forest boundaries",
    },
}
# US-089 Part 1 — NDEM historical flood inundation. 87 MB India-wide → STREAM only, same as
# forests. Props kept minimal + tolerant (NDEM schema varies; the overlay only needs geometry).
_STREAM_LAYERS = {
    "flood_inundation_ka": {
        "src": "NDEM_All_India_Flood_Innundation_1998_to_2022.geojson",
        "props": ["State", "YEAR", "year", "flood", "Flood_Year"],  # tolerant — absent → None
        "source": "NDEM flood inundation 1998-2022 (NRSC/ISRO)",
        "vintage": "1998-2022",
    },
}


def _rep_point_in_ka(geom: Any) -> tuple[float, float] | None:
    """Return the representative point (guaranteed inside the polygon) if it lies in KA, else
    None. Uses shapely for robustness across Polygon/MultiPolygon."""
    from shapely.geometry import shape

    try:
        g = shape(geom) if isinstance(geom, dict) else geom
        p = g.representative_point()
    except Exception:  # noqa: BLE001
        return None
    if _in_ka(p.x, p.y):
        return (p.x, p.y)
    return None


# ── parquet → KA GeoJSON ────────────────────────────────────────────────────
def _prep_parquet(name: str, cfg: dict[str, Any], src_dir: Path) -> dict[str, int]:
    import pyarrow.parquet as pq
    from shapely.geometry import mapping
    from shapely.wkb import loads as wkb_loads

    src = src_dir / cfg["src"]
    if not src.exists():
        sys.exit(f"MISSING source: {src}")
    pf = pq.ParquetFile(src)
    before = pf.metadata.num_rows
    prop_map: dict[str, str] = cfg["props"]
    cols = ["geometry", "xmin", "ymin", "xmax", "ymax", *prop_map.keys()]
    cols = [c for c in cols if c in pf.schema_arrow.names]
    feats: list[dict[str, Any]] = []
    prefiltered = 0
    for batch in pf.iter_batches(batch_size=8192, columns=cols):
        d = batch.to_pydict()
        n = len(d["geometry"])
        for i in range(n):
            if not cfg["already_ka"]:
                if not _bbox_hits_ka(d["xmin"][i], d["ymin"][i], d["xmax"][i], d["ymax"][i]):
                    continue
            prefiltered += 1
            wkb = d["geometry"][i]
            if wkb is None:
                continue
            try:
                geom = wkb_loads(bytes(wkb))
            except Exception:  # noqa: BLE001
                continue
            if not cfg["already_ka"]:
                p = geom.representative_point()
                if not _in_ka(p.x, p.y):   # confirm by geometry, not just bbox
                    continue
            props = {out: d[srcf][i] for srcf, out in prop_map.items() if srcf in d}
            feats.append({"type": "Feature", "geometry": mapping(geom), "properties": props})
    _write(name, feats, cfg["source"])
    return {"before": before, "prefiltered": prefiltered, "after": len(feats)}


# ── whole-GeoJSON → KA GeoJSON ──────────────────────────────────────────────
def _prep_geojson_whole(name: str, cfg: dict[str, Any], src_dir: Path) -> dict[str, int]:
    src = src_dir / cfg["src"]
    if not src.exists():
        sys.exit(f"MISSING source: {src}")
    fc = json.loads(src.read_text(encoding="utf-8"))
    src_feats = fc.get("features", [])
    keep: list[dict[str, Any]] = []
    for f in src_feats:
        if _rep_point_in_ka(f.get("geometry")) is None:
            continue
        props = {k: f.get("properties", {}).get(k) for k in cfg["props"]}
        keep.append({"type": "Feature", "geometry": f["geometry"], "properties": props})
    _write(name, keep, cfg["source"])
    return {"before": len(src_feats), "prefiltered": len(src_feats), "after": len(keep)}


# ── streaming GeoJSON (257 MB forests) → KA GeoJSON ─────────────────────────
def _stream_features(path: Path) -> Iterator[dict[str, Any]]:
    import ijson

    with path.open("rb") as fh:
        yield from ijson.items(fh, "features.item")


def _prep_forests(name: str, cfg: dict[str, Any], src_dir: Path) -> dict[str, int]:
    src = src_dir / cfg["src"]
    if not src.exists():
        sys.exit(f"MISSING source: {src}")
    before = 0
    keep: list[dict[str, Any]] = []
    for f in _stream_features(src):   # never loads the whole file (257 MB forests / 87 MB NDEM)
        before += 1
        if _rep_point_in_ka(f.get("geometry")) is None:
            continue
        props = {k: (f.get("properties") or {}).get(k) for k in cfg["props"]}
        keep.append({"type": "Feature", "geometry": f["geometry"], "properties": props})
    _write(name, keep, cfg["source"], vintage=cfg.get("vintage", "2024"))
    return {"before": before, "prefiltered": before, "after": len(keep)}


# ── write + validate ────────────────────────────────────────────────────────
def _json_default(o: Any) -> Any:
    from decimal import Decimal

    if isinstance(o, Decimal):
        return float(o)
    if hasattr(o, "item"):   # numpy scalar
        return o.item()
    raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")


def _write(name: str, feats: list[dict[str, Any]], source: str, *, vintage: str = "2024") -> None:
    out = _OUT / f"{name}.geojson"
    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "_provenance": {"source": source, "licence": "CC0", "vintage": vintage,
                        "access": "bharatlas", "slice": "Karnataka bbox 11.5-18.5N, 74.0-78.6E",
                        "confidence": "inferred"},
        "features": feats,
    }
    out.write_text(json.dumps(fc, default=_json_default), encoding="utf-8")


def _validate(name: str) -> tuple[int, float]:
    """Reload, confirm CRS + KA-bounds canary (fail loud on a swap / out-of-KA feature)."""
    out = _OUT / f"{name}.geojson"
    fc = json.loads(out.read_text(encoding="utf-8"))
    blob = json.dumps(fc.get("crs", ""))
    if blob and "4326" not in blob and "CRS84" not in blob:
        sys.exit(f"FAIL {name}: non-4326 CRS {blob}")
    feats = fc.get("features", [])
    for f in feats:
        p = _rep_point_in_ka(f.get("geometry"))
        if p is None:
            sys.exit(f"FAIL {name}: a feature's representative point is OUTSIDE Karnataka "
                     "(lat/lon swap or bad slice) — refusing to ship a mis-located layer")
    size_mb = out.stat().st_size / 1e6
    return len(feats), size_mb


_DISPATCH = {
    **{k: ("parquet", v) for k, v in _PARQUET_LAYERS.items()},
    **{k: ("whole", v) for k, v in _GEOJSON_WHOLE.items()},
    **{k: ("forests", v) for k, v in _FOREST_LAYER.items()},
    **{k: ("forests", v) for k, v in _STREAM_LAYERS.items()},  # NDEM flood — same streaming path
}


def main() -> None:
    ap = argparse.ArgumentParser(description="US-088 stage-1 overlay layer prep (dev-time)")
    ap.add_argument("--src-dir", default=str(Path.home() / "Downloads"))
    ap.add_argument("--only", help="prep a single output layer (e.g. lakes_ka)")
    args = ap.parse_args()
    src_dir = Path(args.src_dir)

    targets = [args.only] if args.only else list(_DISPATCH.keys())
    print(f"KA slice window: lat {_KA_LAT}, lon {_KA_LON}\nsource dir: {src_dir}\n")
    for name in targets:
        kind, cfg = _DISPATCH[name]
        if kind == "parquet":
            stats = _prep_parquet(name, cfg, src_dir)
        elif kind == "whole":
            stats = _prep_geojson_whole(name, cfg, src_dir)
        else:
            stats = _prep_forests(name, cfg, src_dir)
        count, size_mb = _validate(name)
        assert count == stats["after"]
        print(f"{name:26s} {stats['before']:>8d} -> {stats['after']:>6d} KA feats "
              f"| {size_mb:6.1f} MB | canary OK")
    print("\nDone. All sliced layers validated (CRS 4326, KA-bounds canary passed).")


if __name__ == "__main__":
    main()
