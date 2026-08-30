# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Infrastructure overlay data: road widths, encroachment, water/power/gas/sewerage layers.

All parquets return WGS84 GeoJSON. bbox param format: "minlng,minlat,maxlng,maxlat".
Missing parquet files return empty FeatureCollection (graceful — do not crash the service).
"""

from __future__ import annotations

import json
import os
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

REPO_ROOT = os.environ.get("CADASTRAL_REPO_ROOT", ".")

def _env(key: str, default: str) -> str:
    return os.environ.get(key, os.path.join(REPO_ROOT, default))

LGD_VILLAGES_PATH      = _env("LGD_VILLAGES_PATH",      "data/lgd_villages.parquet")
WRIS_LAKES_PATH        = _env("WRIS_LAKES_PATH",         "data/wris_lakes.parquet")
DRAINAGE_OSM_PATH      = _env("DRAINAGE_OSM_PATH",       "data/drainage_osm.parquet")
HYDRORIVERS_PATH       = _env("HYDRORIVERS_PATH",         "data/hydrorivers.parquet")
ENCROACHMENT_PATH      = _env("ENCROACHMENT_PATH",        "data/encroachment_parcels.parquet")
ENCROACHMENT_PROX_PATH = _env("ENCROACHMENT_PROX_PATH",  "data/encroachment_proximity.parquet")
BWSSB_SEWERAGE_PATH    = _env("BWSSB_SEWERAGE_PATH",     "data/bwssb_sewerage.parquet")
BBMP_SWD_PATH          = _env("BBMP_SWD_PATH",           "data/bbmp_swd.parquet")
OSM_POWERLINES_PATH    = _env("OSM_POWERLINES_PATH",     "data/osm_powerlines.parquet")
BESCOM_BOUNDS_PATH     = _env("BESCOM_BOUNDS_PATH",      "data/bescom_boundaries.parquet")
GAS_PIPELINES_PATH     = _env("GAS_PIPELINES_PATH",      "data/osm_gas_pipelines.parquet")
GAS_STATIONS_PATH      = _env("GAS_STATIONS_PATH",       "data/gas_stations.parquet")
OSM_GAS_NODES_PATH     = _env("OSM_GAS_NODES_PATH",      "data/osm_gas_nodes.parquet")
BBMP_ROAD_WIDTH_PATH   = _env("BBMP_ROAD_WIDTH_PATH",    "data/bbmp_road_width.parquet")
OSM_ROAD_WIDTH_PATH    = _env("OSM_ROAD_WIDTH_PATH",     "data/osm_road_widths.parquet")
PNGRB_CGD_ZONES_PATH   = _env("PNGRB_CGD_ZONES_PATH",   "data/pngrb_cgd_zones.geojson")

_EMPTY_FC = '{"type":"FeatureCollection","features":[]}'
KARNATAKA_LGD = 29

# In-memory caches for large line layers + village hierarchy map
_cache: dict[str, gpd.GeoDataFrame] = {}
_village_map: dict[int, tuple[str, str, str, str]] | None = None  # lgd_code → (dist,taluk,hobli,vlg)


def _load_once(key: str, path: str, columns: list[str] | None = None) -> gpd.GeoDataFrame | None:
    if key not in _cache:
        if not os.path.exists(path):
            return None
        try:
            gdf = gpd.read_parquet(path, columns=columns) if columns else gpd.read_parquet(path)
            _cache[key] = gdf
        except Exception:
            return None
    return _cache.get(key)


def _bbox_filter(gdf: gpd.GeoDataFrame, bbox_str: str | None) -> gpd.GeoDataFrame:
    if not bbox_str:
        return gdf
    try:
        minlng, minlat, maxlng, maxlat = [float(v) for v in bbox_str.split(",")]
        clip_box = box(minlng, minlat, maxlng, maxlat)
        return gdf[gdf.intersects(clip_box)]
    except Exception:
        return gdf


def _to_json(gdf: gpd.GeoDataFrame) -> str:
    if gdf.empty:
        return _EMPTY_FC
    return gdf.to_json()


def lgd_villages_geojson(rccms_db: str) -> str:
    gdf = _load_once(
        "lgd_villages",
        LGD_VILLAGES_PATH,
        ["geometry", "vil_lgd", "vilname11", "dist_lgd", "state_lgd"],
    )
    if gdf is None:
        return _EMPTY_FC
    import sqlite3
    gdf = gdf[gdf["state_lgd"] == KARNATAKA_LGD].copy()
    try:
        conn = sqlite3.connect(rccms_db)
        vm = pd.read_sql("SELECT village_code FROM villages_master", conn)
        conn.close()
        vm["lgd_code"] = vm["village_code"].apply(lambda x: int(x.rsplit("_", 1)[0]))
        covered_set = set(vm["lgd_code"].tolist())
        gdf["covered"] = gdf["vil_lgd"].isin(covered_set)
    except Exception:
        gdf["covered"] = False
    return _to_json(gdf)


def road_width_geojson(bbox: str | None = None) -> str:
    frames = []
    bbmp = _load_once("bbmp_road", BBMP_ROAD_WIDTH_PATH)
    osm = _load_once("osm_road", OSM_ROAD_WIDTH_PATH)
    if bbmp is not None:
        frames.append(_bbox_filter(bbmp, bbox))
    if osm is not None:
        frames.append(_bbox_filter(osm, bbox))
    if not frames:
        return _EMPTY_FC
    merged = pd.concat(frames, ignore_index=True)
    gdf = gpd.GeoDataFrame(merged, geometry="geometry", crs=4326)
    # Annotate FAR tier per RMP road-width table (client can use width_m too, but pre-compute)
    if "width_m" in gdf.columns:
        def far_tier(w: float | None) -> float | None:
            if w is None or pd.isna(w):
                return None
            if w < 9:   return 1.5
            if w < 12:  return 1.75
            if w < 18:  return 2.25
            if w < 24:  return 2.75
            if w < 30:  return 3.25
            return 3.75
        gdf["far_rmp"] = gdf["width_m"].apply(far_tier)
    return _to_json(gdf)


def encroachment_geojson(bbox: str | None = None) -> str | None:
    path = ENCROACHMENT_PROX_PATH if os.path.exists(ENCROACHMENT_PROX_PATH) else ENCROACHMENT_PATH
    if not os.path.exists(path):
        return None  # caller returns 404
    cols = ["geometry", "village_name", "survey_no", "lgd_code",
            "bbmp_notified", "revenue_flagged", "near_drain", "near_lake"]
    prox_extra = ["nearest_drain_type", "dist_to_drain_m", "nearest_lake_name", "dist_to_lake_m"]
    if "prox" in path:
        cols += [c for c in prox_extra if c not in cols]
    try:
        gdf = gpd.read_parquet(path, columns=[c for c in cols if True])
        gdf = _bbox_filter(gdf, bbox)
        return _to_json(gdf)
    except Exception:
        return _EMPTY_FC


def bwssb_sewerage_geojson(tier: str | None = None, bbox: str | None = None) -> str:
    gdf = _load_once("bwssb", BWSSB_SEWERAGE_PATH)
    if gdf is None:
        return _EMPTY_FC
    gdf = _bbox_filter(gdf, bbox)
    if tier and "diameter_range" in gdf.columns:
        gdf = gdf[gdf["diameter_range"] == tier]
    return _to_json(gdf)


def osm_powerlines_geojson(bbox: str | None = None) -> str:
    gdf = _load_once("powerlines", OSM_POWERLINES_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def gas_pipelines_geojson(bbox: str | None = None) -> str:
    gdf = _load_once("gas_pipelines", GAS_PIPELINES_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def gas_nodes_geojson(bbox: str | None = None) -> str:
    gdf = _load_once("gas_nodes", OSM_GAS_NODES_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def drainage_geojson(bbox: str | None = None) -> str:
    """OSM waterways only (canal/drain/stream/ditch). HydroRIVERS served by hydrorivers_geojson."""
    gdf = _load_once("drainage_osm", DRAINAGE_OSM_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def hydrorivers_geojson(bbox: str | None = None) -> str:
    """HydroRIVERS river network (Strahler order, discharge, length)."""
    gdf = _load_once("hydrorivers", HYDRORIVERS_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def bbmp_swd_geojson(bbox: str | None = None) -> str:
    """BBMP storm water drain network (primary/secondary/tertiary tiers)."""
    gdf = _load_once("bbmp_swd", BBMP_SWD_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def cgd_zones_geojson() -> str | None:
    """PNGRB City Gas Distribution zone boundaries (GeoJSON file, returned as-is)."""
    if not os.path.exists(PNGRB_CGD_ZONES_PATH):
        return None
    try:
        with open(PNGRB_CGD_ZONES_PATH, encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def wris_lakes_geojson(bbox: str | None = None) -> str:
    gdf = _load_once("wris_lakes", WRIS_LAKES_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(_bbox_filter(gdf, bbox))


def bescom_boundaries_geojson() -> str:
    gdf = _load_once("bescom", BESCOM_BOUNDS_PATH)
    if gdf is None:
        return _EMPTY_FC
    return _to_json(gdf)


def _get_village_map(rccms_db: str) -> dict[int, tuple[str, str, str, str]]:
    """lgd_code → (district_code, taluk_code, hobli_code, vlg_local). Cached after first load.

    villages_master.village_code = "{lgd_code}_{vlg_local}" — prefix is the LGD code.
    district_code/taluk_code/hobli_code are the filesystem path coordinates (dist_N/taluk_N/hobli_N).
    Only covers villages scraped into the parquet lake; urban core (939xxx, 803xxx LGD codes) not present.
    """
    global _village_map
    if _village_map is not None:
        return _village_map
    import sqlite3
    try:
        conn = sqlite3.connect(rccms_db)
        rows = conn.execute(
            "SELECT village_code, district_code, taluk_code, hobli_code FROM villages_master"
        ).fetchall()
        conn.close()
        m: dict[int, tuple[str, str, str, str]] = {}
        for vc, dist, taluk, hobli in rows:
            parts = str(vc).rsplit("_", 1)
            if len(parts) == 2:
                try:
                    m[int(parts[0])] = (str(dist), str(taluk), str(hobli), parts[1])
                except ValueError:
                    pass
        _village_map = m
        return m
    except Exception:
        return {}


def parcels_by_bbox(bbox_str: str, rccms_db: str, data_dir: str) -> str:
    """Return merged parcel GeoJSON for all e-Chawadi villages intersecting bbox.

    Flow: lgd_villages parquet (spatial index) → villages_master (hierarchy lookup)
    → dist_N/taluk_N/hobli_N/vlg_N.parquet files → merged WGS84 GeoJSON.
    """
    from app.services.cadastral_service import load_village

    gdf_villages = _load_once(
        "lgd_villages", LGD_VILLAGES_PATH, ["geometry", "vil_lgd", "state_lgd"]
    )
    if gdf_villages is None:
        return _EMPTY_FC

    ka = gdf_villages[gdf_villages["state_lgd"] == KARNATAKA_LGD]
    in_bbox = _bbox_filter(ka, bbox_str)
    if in_bbox.empty:
        return _EMPTY_FC

    lgd_codes = set(int(c) for c in in_bbox["vil_lgd"].tolist() if not pd.isna(c))
    village_map = _get_village_map(rccms_db)

    frames = []
    for lgd_code in lgd_codes:
        entry = village_map.get(lgd_code)
        if entry is None:
            continue
        dist, taluk, hobli, vlg = entry
        path = os.path.join(data_dir, f"dist_{dist}", f"taluk_{taluk}", f"hobli_{hobli}", f"vlg_{vlg}.parquet")
        gdf = load_village(path)
        if gdf is not None and not gdf.empty:
            # Tag with hierarchy so frontend can call /data + /rccms + /mutations
            gdf["dist"] = dist
            gdf["taluk"] = taluk
            gdf["hobli"] = hobli
            gdf["vlg"] = vlg
            frames.append(gdf)

    if not frames:
        return _EMPTY_FC

    merged = pd.concat(frames, ignore_index=True)
    return gpd.GeoDataFrame(merged, geometry="geometry", crs=4326).to_json()
