# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Core cadastral data access: parcel parquets + SQLite land records.

Source parquets (cadastral_lake_v2) store EPSG:32643 with X/Y swapped — a known upstream
scraper bug. load_village() compensates via affine transform at read time. Do not read the
parquets directly without applying the same fix.

Data layout: CADASTRAL_DATA_DIR/dist_<d>/taluk_<t>/hobli_<h>/vlg_<v>.parquet
SQLite: CADASTRAL_DB_PATH  (villages_master, rccms_cases, mutations, survey_index)
"""

from __future__ import annotations

import glob
import os
import sqlite3
from typing import Any

import geopandas as gpd
import pandas as pd

DATA_DIR = os.environ.get("CADASTRAL_DATA_DIR", "data/cadastral_lake_v2")
RCCMS_DB = os.environ.get("CADASTRAL_DB_PATH", "db/karnataka_lands_full.db")

# Swap X↔Y: new_x=y, new_y=x — compensates for the scraper building Polygon(Northing, Easting)
# instead of Polygon(Easting, Northing) in EPSG:32643.
_SWAP_XY = [0, 1, 1, 0, 0, 0]


def load_village(path: str) -> gpd.GeoDataFrame | None:
    """Read one vlg_*.parquet, fix swapped axes, reproject to WGS84. None if placeholder."""
    try:
        gdf = gpd.read_parquet(path)
    except (ValueError, Exception):
        return None
    if gdf.empty or "geometry" not in gdf.columns:
        return None
    gdf["geometry"] = gdf.geometry.affine_transform(_SWAP_XY)
    gdf = gdf.set_crs(32643, allow_override=True).to_crs(4326)
    return gdf


def find_paths(
    dist: str | None = None,
    taluk: str | None = None,
    hobli: str | None = None,
    vlg: str | None = None,
) -> list[str]:
    dist_part  = f"dist_{dist}"        if dist  else "dist_*"
    taluk_part = f"taluk_{taluk}"      if taluk else "taluk_*"
    hobli_part = f"hobli_{hobli}"      if hobli else "hobli_*"
    vlg_part   = f"vlg_{vlg}.parquet" if vlg   else "vlg_*.parquet"
    pattern = os.path.join(DATA_DIR, dist_part, taluk_part, hobli_part, vlg_part)
    return sorted(glob.glob(pattern))


def build_geojson(
    dist: str | None = None,
    taluk: str | None = None,
    hobli: str | None = None,
    vlg: str | None = None,
    survey: str | None = None,
) -> str:
    frames = [g for p in find_paths(dist, taluk, hobli, vlg) if (g := load_village(p)) is not None]
    if not frames:
        return '{"type":"FeatureCollection","features":[]}'
    merged = pd.concat(frames, ignore_index=True)
    if survey and "survey_no" in merged.columns:
        merged = merged[merged["survey_no"] == survey]
    return gpd.GeoDataFrame(merged, geometry="geometry", crs=4326).to_json()


def _village_join_code(dist: str, taluk: str, hobli: str, vlg: str) -> str | None:
    """Returns the combined join key '{lgd_code}_{vlg_local}' used in rccms_cases + mutations."""
    paths = find_paths(dist, taluk, hobli, vlg)
    if not paths:
        return None
    try:
        df = pd.read_parquet(paths[0])
    except Exception:
        return None
    if "village_code" not in df.columns or df.empty:
        return None
    return f"{df['village_code'].iloc[0]}_{vlg}"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(RCCMS_DB)
    conn.row_factory = sqlite3.Row
    return conn


def get_rccms(dist: str, taluk: str, hobli: str, vlg: str) -> list[dict[str, Any]]:
    code = _village_join_code(dist, taluk, hobli, vlg)
    if not code:
        return []
    conn = _connect()
    rows = conn.execute(
        "SELECT ack_no, case_id, applicant_name, survey_no, case_status "
        "FROM rccms_cases WHERE village_code=?",
        (code,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_mutations(dist: str, taluk: str, hobli: str, vlg: str) -> list[dict[str, Any]]:
    code = _village_join_code(dist, taluk, hobli, vlg)
    if not code:
        return []
    conn = _connect()
    rows = conn.execute(
        "SELECT tran_no, mr_number, applicant, transaction_type, survey_numbers, status, acquisition_type "
        "FROM mutations WHERE village_code=?",
        (code,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_survey(q: str, limit: int = 25) -> list[dict[str, Any]]:
    q_norm = q.split("/")[0].strip()
    if len(q_norm) < 2:
        return []
    conn = _connect()
    rows = conn.execute(
        """SELECT DISTINCT s.survey_no,
                  COALESCE(NULLIF(s.village_name,''), NULLIF(vm.village_name,''), '') AS vname,
                  s.dist, s.taluk, s.hobli, s.vlg
           FROM survey_index s
           LEFT JOIN villages_master vm
             ON vm.village_code = s.village_code || '_' || s.vlg
           WHERE s.survey_no_norm LIKE ?
           ORDER BY CAST(s.survey_no_norm AS INTEGER),
                    CASE WHEN COALESCE(NULLIF(s.village_name,''), NULLIF(vm.village_name,'')) IS NULL
                         THEN 1 ELSE 0 END,
                    vname
           LIMIT ?""",
        (q_norm + "%", limit),
    ).fetchall()
    conn.close()
    return [
        {"survey_no": r[0], "village_name": r[1], "dist": r[2], "taluk": r[3], "hobli": r[4], "vlg": r[5]}
        for r in rows
    ]


def get_village_info(dist: str, taluk: str, hobli: str, vlg: str) -> dict[str, Any]:
    paths = find_paths(dist, taluk, hobli, vlg)
    has_parcel = False
    if paths:
        try:
            df = pd.read_parquet(paths[0])
            has_parcel = not df.empty and "village_code" in df.columns
        except Exception:
            pass

    village_name: str | None = None
    lgd_code: str | None = None
    conn = _connect()

    rows = conn.execute(
        "SELECT village_code, village_name FROM villages_master "
        "WHERE district_code=? AND taluk_code=? AND hobli_code=?",
        (dist, taluk, hobli),
    ).fetchall()
    for r in rows:
        parts = r[0].rsplit("_", 1)
        if len(parts) == 2 and parts[1] == str(vlg):
            lgd_code = parts[0]
            village_name = r[1]
            break

    if lgd_code is None:
        sample = conn.execute(
            "SELECT village_code FROM villages_master "
            "WHERE district_code=? AND taluk_code=? AND hobli_code=? LIMIT 1",
            (dist, taluk, hobli),
        ).fetchone()
        if sample:
            sample_lgd = sample[0].rsplit("_", 1)[0]
            ec = conn.execute(
                "SELECT dist_e, taluk_e, hobli_e FROM village_roster WHERE lgd_code=?",
                (int(sample_lgd),),
            ).fetchone()
            if ec:
                roster_row = conn.execute(
                    "SELECT lgd_code, village_name FROM village_roster "
                    "WHERE dist_e=? AND taluk_e=? AND hobli_e=? AND vlg_local=?",
                    (ec[0], ec[1], ec[2], int(vlg)),
                ).fetchone()
                if roster_row:
                    lgd_code = str(roster_row[0])
                    village_name = roster_row[1]
    conn.close()
    return {
        "village_name": village_name or f"Village {vlg} (dist {dist})",
        "lgd_code": lgd_code,
        "has_parcel_data": has_parcel,
    }


def _list_dir_codes(path: str, prefix: str) -> list[str]:
    """Numeric code strings from subdirs/files matching prefix, sorted int order."""
    if not os.path.isdir(path):
        return []
    codes = []
    for n in os.listdir(path):
        if n.startswith(prefix):
            stem = os.path.splitext(n[len(prefix):])[0]
            if stem.isdigit():
                codes.append(stem)
    return sorted(codes, key=int)


def list_districts() -> list[dict[str, str]]:
    codes = _list_dir_codes(DATA_DIR, "dist_")
    if not codes:
        return []
    conn = _connect()
    result = []
    for c in codes:
        row = conn.execute(
            "SELECT district_name FROM village_roster WHERE dist_e=? LIMIT 1", (int(c),)
        ).fetchone()
        result.append({"code": c, "name": row[0] if row and row[0] else c})
    conn.close()
    return result


def list_taluks(dist: str) -> list[dict[str, str]]:
    path = os.path.join(DATA_DIR, f"dist_{dist}")
    codes = _list_dir_codes(path, "taluk_")
    if not codes:
        return []
    conn = _connect()
    result = []
    for c in codes:
        row = conn.execute(
            "SELECT taluk_name FROM village_roster WHERE dist_e=? AND taluk_e=? LIMIT 1",
            (int(dist), int(c)),
        ).fetchone()
        result.append({"code": c, "name": row[0] if row and row[0] else c})
    conn.close()
    return result


def list_hoblis(dist: str, taluk: str) -> list[dict[str, str]]:
    path = os.path.join(DATA_DIR, f"dist_{dist}", f"taluk_{taluk}")
    codes = _list_dir_codes(path, "hobli_")
    if not codes:
        return []
    conn = _connect()
    result = []
    for c in codes:
        row = conn.execute(
            "SELECT hobli_name FROM village_roster "
            "WHERE dist_e=? AND taluk_e=? AND hobli_e=? LIMIT 1",
            (int(dist), int(taluk), int(c)),
        ).fetchone()
        result.append({"code": c, "name": row[0] if row and row[0] else c})
    conn.close()
    return result


def list_villages(dist: str, taluk: str, hobli: str) -> list[dict[str, str]]:
    path = os.path.join(DATA_DIR, f"dist_{dist}", f"taluk_{taluk}", f"hobli_{hobli}")
    codes = _list_dir_codes(path, "vlg_")
    if not codes:
        return []
    conn = _connect()
    result = []
    for c in codes:
        row = conn.execute(
            "SELECT village_name FROM village_roster "
            "WHERE dist_e=? AND taluk_e=? AND hobli_e=? AND vlg_local=? LIMIT 1",
            (int(dist), int(taluk), int(hobli), int(c)),
        ).fetchone()
        result.append({"code": c, "name": row[0] if row and row[0] else c})
    conn.close()
    return result


def get_village_by_lgd(lgd_code: str) -> dict[str, Any]:
    if not lgd_code:
        return {}
    try:
        lgd_int = int(lgd_code)
    except (ValueError, TypeError):
        return {}
    conn = _connect()
    covered = conn.execute(
        "SELECT 1 FROM villages_master WHERE village_code LIKE ? LIMIT 1",
        (f"{lgd_code}_%",),
    ).fetchone() is not None
    row = conn.execute(
        "SELECT village_name, hobli_name, taluk_name, district_name "
        "FROM village_roster WHERE lgd_code=?",
        (lgd_int,),
    ).fetchone()
    conn.close()
    if row:
        return {
            "lgd_code": lgd_code,
            "village_name": row[0],
            "hobli_name": row[1],
            "taluk_name": row[2],
            "district_name": row[3],
            "covered": covered,
        }
    return {"lgd_code": lgd_code, "covered": covered}
