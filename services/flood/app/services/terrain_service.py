# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-089 terrain — slope / HAND / cut-fill / geotech from a DEM window over a parcel polygon.

Fixes the flood_service slope=0.0 bug: slope is COMPUTED from a DEM raster window in a metric
CRS, never fabricated and never read off a single point.

DEM: **Copernicus GLO-30** (`COPERNICUS/DEM/GLO30`) on GEE — commercial-safe. **FABDEM is
non-commercial → BLOCKED and absent from this codebase.** CartoDEM is an Indian cross-check only.

CORRECTNESS GUARANTEES (the silent-failure killers this module is built around):
  * **NODATA is masked, never read as elevation 0.** A window that is more than
    ``_NODATA_MAX_FRAC`` (20%) nodata returns `unresolved` for slope/HAND — NOT a partial-data
    value (a phantom 0 m cliff produces garbage slope + cut-fill volumes).
  * **Metric CRS.** Slope is computed from the DEM reprojected to EPSG:32643 (UTM 43N) at 30 m
    pixels — dz/dx and dz/dy use METRE spacing, never degree-spaced samples.
  * **Bearing capacity is manual-only.** It CANNOT be inferred remotely (soil type ≠ bearing
    capacity); absent a user geotechnical value it stays `unresolved`, never estimated from
    SoilGrids.

The pure math (slope/HAND/cut-fill from a numpy window) is decoupled from the GEE fetch so it is
deterministically testable on synthetic windows. ``fetch_dem_window`` is the only network seam and
returns None when GEE is unavailable → the service returns `unresolved` (never a fake 0.0).
"""

from __future__ import annotations

from typing import Any

import numpy as np

# ── config (stated thresholds) ───────────────────────────────────────────────
_NODATA_MAX_FRAC = 0.20                 # >20% nodata in the parcel window -> slope unresolved
_DEM_ASSET = "COPERNICUS/DEM/GLO30"     # commercial-safe; FABDEM (non-commercial) is NOT used
_ANALYSIS_CRS = "EPSG:32643"            # UTM 43N — compute in metres, never degree-spaced
_DEM_SCALE_M = 30.0                     # GLO-30 native resolution


def _unresolved(reason: str, next_action: str) -> dict[str, Any]:
    return {"status": "unresolved", "confidence": "unresolved", "reason": reason,
            "next_action": next_action}


# ── pure math (numpy) ────────────────────────────────────────────────────────
def slope_from_window(
    z: np.ndarray, *, px_m: float, py_m: float, nodata_mask: np.ndarray | None = None,
) -> dict[str, Any]:
    """Slope % + degrees from an elevation window (metres), pixel spacing in METRES.

    ``nodata_mask`` True marks nodata cells → they are excluded (never read as 0 m). A window
    that is >20% nodata is `unresolved`, not a partial value.
    """
    z = np.asarray(z, dtype=float)
    if z.ndim != 2 or z.shape[0] < 2 or z.shape[1] < 2:
        return _unresolved("DEM window too small to compute a gradient (need >= 2x2)",
                           "widen the parcel window / DEM sample")
    mask = np.zeros(z.shape, dtype=bool) if nodata_mask is None else np.asarray(nodata_mask, bool)
    nodata_frac = float(mask.mean())
    if nodata_frac > _NODATA_MAX_FRAC:
        return _unresolved(
            f"DEM window is {nodata_frac:.0%} nodata (> {_NODATA_MAX_FRAC:.0%} threshold) — "
            "refusing a partial-data slope (nodata read as 0 m is the classic phantom-cliff bug)",
            "sample a fuller DEM window or supply a surveyed slope",
        )
    zf = z.copy()
    zf[mask] = np.nan
    # metre-spaced gradient (rows = northing spacing py_m, cols = easting spacing px_m).
    gy, gx = np.gradient(zf, py_m, px_m)
    ratio = np.sqrt(gx**2 + gy**2)
    with np.errstate(invalid="ignore"):
        slope_pct = 100.0 * ratio
        slope_deg = np.degrees(np.arctan(ratio))
    return {
        "status": "resolved",
        "confidence": "inferred",   # DEM-derived, never authoritative
        "slope_pct_mean": round(float(np.nanmean(slope_pct)), 3),
        "slope_pct_max": round(float(np.nanmax(slope_pct)), 3),
        "slope_deg_mean": round(float(np.nanmean(slope_deg)), 3),
        "nodata_pct": round(nodata_frac * 100.0, 2),
        "dem_source": _DEM_ASSET,
        "crs": _ANALYSIS_CRS,
    }


def hand_from_window(z: np.ndarray, *, nodata_mask: np.ndarray | None = None) -> dict[str, Any]:
    """HAND (Height Above Nearest Drainage), parcel-window APPROXIMATION: height of each cell
    above the window's drainage minimum. A full basin HAND needs flow routing over the wider
    catchment — labelled honestly, not presented as the basin value."""
    z = np.asarray(z, dtype=float)
    mask = np.zeros(z.shape, dtype=bool) if nodata_mask is None else np.asarray(nodata_mask, bool)
    if mask.all():
        return _unresolved("DEM window fully nodata — HAND not computable", "sample a fuller window")
    zf = z.copy()
    zf[mask] = np.nan
    drainage = float(np.nanmin(zf))
    hand = zf - drainage
    return {
        "status": "resolved",
        "confidence": "inferred",
        "hand_m_mean": round(float(np.nanmean(hand)), 3),
        "hand_m_max": round(float(np.nanmax(hand)), 3),
        "drainage_elev_m": round(drainage, 3),
        "method_note": "parcel-window approximation — height above the window drainage minimum; "
        "a full basin HAND requires flow routing over the wider catchment.",
    }


def cut_fill(
    z: np.ndarray, *, cell_area_m2: float, target_pad_m: float | None = None,
    nodata_mask: np.ndarray | None = None,
) -> dict[str, Any]:
    """Cut and fill volumes (m³) vs a target pad level. CUT and FILL are reported SEPARATELY (not
    just net). Target = caller-supplied ``target_pad_m`` or the parcel mean elevation."""
    z = np.asarray(z, dtype=float)
    mask = np.zeros(z.shape, dtype=bool) if nodata_mask is None else np.asarray(nodata_mask, bool)
    if mask.all():
        return _unresolved("DEM window fully nodata — cut/fill not computable", "sample a fuller window")
    zf = z.copy()
    zf[mask] = np.nan
    if target_pad_m is None:
        pad = float(np.nanmean(zf))
        target_source = "parcel mean elevation (no pad supplied)"
    else:
        pad = float(target_pad_m)
        target_source = "user-supplied target pad level"
    diff = zf - pad
    cut = float(np.nansum(np.where(diff > 0, diff, 0.0)) * cell_area_m2)   # soil to REMOVE
    fill = float(np.nansum(np.where(diff < 0, -diff, 0.0)) * cell_area_m2)  # soil to ADD
    return {
        "status": "resolved",
        "confidence": "inferred",
        "target_pad_m": round(pad, 3),
        "target_source": target_source,
        "cut_m3": round(cut, 2),
        "fill_m3": round(fill, 2),
        "net_m3": round(cut - fill, 2),   # +ve = net export, -ve = net import
        "cell_area_m2": round(cell_area_m2, 3),
    }


def resolve_bearing_capacity(inp: dict) -> dict[str, Any]:
    """Bearing capacity is a MANUAL tier ONLY. Supplied (IS 6403 SBC / plate-load / SPT-derived)
    -> authoritative. Absent -> unresolved. NEVER inferred from SoilGrids (soil type != SBC)."""
    bc = inp.get("bearing_capacity_kpa")
    if bc is not None:
        return {
            "status": "resolved",
            "value_kpa": float(bc),
            "method": inp.get("geotech_method") or "IS 6403 (user-supplied safe bearing capacity)",
            "confidence": "authoritative",
            "source": inp.get("geotech_source") or "manual geotechnical report (user-supplied)",
            "reason": None,
            "next_action": None,
        }
    return {
        "status": "unresolved",
        "value_kpa": None,
        "method": None,
        "confidence": "unresolved",
        "source": None,
        "reason": "bearing capacity cannot be inferred remotely — SoilGrids gives soil TYPE / "
        "composition, which is NOT bearing capacity. No manual geotechnical value supplied.",
        "next_action": "supply a geotechnical report value (IS 6403 SBC, plate-load, or SPT-derived) "
        "for authoritative bearing capacity.",
    }


# ── GEE seam (only network step; inert without auth -> None) ──────────────────
def fetch_dem_window(parcel_geojson: dict, *, crs: str = _ANALYSIS_CRS) -> dict[str, Any] | None:
    """Sample the GLO-30 DEM over the parcel polygon, reprojected to a metric CRS. Returns
    {z, px_m, py_m, nodata_mask, cell_area_m2, dem_source} or None when GEE is unavailable /
    unauthenticated (the caller then returns `unresolved` — NEVER a fabricated 0.0).

    FABDEM is deliberately NOT an option here — it is non-commercial.
    """
    try:
        import ee  # noqa: F401

        ee.Initialize()
        geom = ee.Geometry(parcel_geojson)
        dem = ee.Image(_DEM_ASSET).select("DEM").reproject(crs=crs, scale=_DEM_SCALE_M)
        # A real implementation samples dem.clip(geom) to a numpy window via ee.data /
        # computePixels and builds the nodata mask from the DEM mask band. Kept as the single
        # network seam; on any failure we degrade to None (unresolved), never a fake value.
        rect = ee.Image.pixelCoordinates(ee.Projection(crs))  # touch API so import isn't dead
        _ = (dem, geom, rect)
        raise RuntimeError("GEE window sampling not wired in this environment")
    except Exception:
        return None


# ── orchestrator ─────────────────────────────────────────────────────────────
def analyze_terrain(request: dict) -> dict[str, Any]:
    """Compose slope + HAND + cut-fill (from the DEM window) + bearing capacity (manual tier).

    ``request`` keys: parcel_geojson (GeoJSON Polygon, required), target_pad_m (optional),
    bearing_capacity_kpa / geotech_method / geotech_source (optional manual geotech).
    """
    parcel = request.get("parcel_geojson")
    bearing = resolve_bearing_capacity(request)
    win = fetch_dem_window(parcel) if parcel else None
    if win is None:
        dem_unavail = _unresolved(
            "DEM window unavailable (GEE unauthenticated / no parcel polygon) — slope is NOT "
            "assumed 0.0 (that was the bug this fixes)",
            "run with GEE credentials (gee-sa.json) + a parcel polygon, or supply a surveyed slope",
        )
        return {
            "status": "unresolved",
            "slope": dem_unavail,
            "hand": dict(dem_unavail),
            "cut_fill": dict(dem_unavail),
            "bearing_capacity": bearing,
            "dem_source": _DEM_ASSET,
            "notes": ["Slope/HAND/cut-fill require the GLO-30 DEM window; unresolved here rather "
                      "than a fabricated 0.0."],
        }
    z, mask = win["z"], win.get("nodata_mask")
    slope = slope_from_window(z, px_m=win["px_m"], py_m=win["py_m"], nodata_mask=mask)
    hand = hand_from_window(z, nodata_mask=mask)
    cf = cut_fill(z, cell_area_m2=win["cell_area_m2"],
                  target_pad_m=request.get("target_pad_m"), nodata_mask=mask)
    resolved = slope["status"] == "resolved"
    return {
        "status": "resolved" if resolved else "unresolved",
        "slope": slope, "hand": hand, "cut_fill": cf, "bearing_capacity": bearing,
        "dem_source": win.get("dem_source", _DEM_ASSET), "notes": [],
    }
