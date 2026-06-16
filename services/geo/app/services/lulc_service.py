"""
Bhuvan ISRO LULC (Land Use / Land Cover) service.

Queries the NRSC/ISRO Bhuvan WMS GetFeatureInfo endpoint for the India LULC
dataset at 1:50K scale. Tries the 2022-23 dataset first; falls back to
2019-20 if the newer layer returns no features (it may not be deployed on
all WMS nodes). Returns the vintage used so callers can surface it to users.

Bhuvan WMS: https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms
Auth: None (public WMS layer)
Resolution: ~1:50,000 (~20m ground)

Fails gracefully — returns (None, None, None) on any error so the caller can
fall back to OSM classification without crashing.
"""
from __future__ import annotations

import httpx

_BHUVAN_WMS = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"

# SISDP Phase-2 LULC (10K, 2016-2019) — the layers actually published on the
# Bhuvan WMS node. The older `lulc50k:India_LULC_20XX` names return
# LayerNotDefined. Karnataka-specific layer first (clean Level_I..IV schema for
# the app's BDA region), India-wide phase-2 as the national fallback.
_LAYERS_PRIORITY: list[tuple[str, str]] = [
    ("sisdp_phase2:SISDP_P2_LULC_10K_2016_2019_KA", "2016-2019"),
    ("sisdp_phase2:lulc_phase2_india", "2016-2019"),
]

# ISRO NRSC LULC 50K class code → (label, category, is_agricultural, is_forest)
# Source: NRSC LULC 50K legend / NRIS documentation
LULC_CODES: dict[int, tuple[str, str, bool, bool]] = {
    1:  ("Built-up land",                          "urban",        False, False),
    2:  ("Agricultural land (Kharif)",             "agricultural", True,  False),
    3:  ("Agricultural land (Rabi)",               "agricultural", True,  False),
    4:  ("Agricultural land (Zaid)",               "agricultural", True,  False),
    5:  ("Agricultural land (Double/Triple crop)", "agricultural", True,  False),
    6:  ("Agricultural land (Current fallow)",     "agricultural", True,  False),
    7:  ("Agricultural land (Other fallow)",       "agricultural", True,  False),
    8:  ("Agri-plantation",                        "agricultural", True,  False),
    9:  ("Orchard / horticulture",                 "agricultural", True,  False),
    10: ("Forest (Deciduous broad leaf)",          "forest",       False, True),
    11: ("Forest (Evergreen/semi-evergreen)",      "forest",       False, True),
    12: ("Forest (Scrub)",                         "forest",       False, True),
    13: ("Forest (Littoral/swamp)",                "forest",       False, True),
    14: ("Plantation (Forest)",                    "forest",       False, True),
    15: ("Grassland / grazing land",               "grassland",    False, False),
    16: ("Wasteland (Scrub/shrub)",                "wasteland",    False, False),
    17: ("Wasteland (Rocky/stony)",                "wasteland",    False, False),
    18: ("Wasteland (Salt affected)",              "wasteland",    False, False),
    19: ("Wasteland (Waterlogged)",                "wetland",      False, False),
    20: ("Wetland (Mangrove)",                     "wetland",      False, True),
    21: ("Wetland (Other)",                        "wetland",      False, False),
    22: ("Water body (River/stream)",              "water",        False, False),
    23: ("Water body (Lake/reservoir)",            "water",        False, False),
    24: ("Shifting cultivation",                   "agricultural", True,  False),
    25: ("Mining / quarry",                        "industrial",   False, False),
    26: ("Sandy area",                             "wasteland",    False, False),
    27: ("Snow / glacier",                         "other",        False, False),
}

# NA order (Non-Agricultural conversion) is needed for construction on these categories
_NA_CATEGORIES = {"agricultural", "grassland"}
_FOREST_CATEGORIES = {"forest"}


def _category_code(level_i: str, lulc_1: str) -> int | None:
    """
    Map the SISDP Phase-2 textual classification (Level_I text + LULC_1 2-letter
    code) onto a synthetic numeric code in LULC_CODES, so lulc_flags() keeps
    deriving NA-order / forest-clearance flags unchanged.
    """
    s = (level_i or "").lower()
    c = (lulc_1 or "").upper()
    if "plantation" in s or c == "PL":
        return 8   # agri-plantation → NA order
    if "agri" in s or c == "AL":
        return 2   # agricultural → NA order
    if "forest" in s or "tree clad" in s or c == "FR":
        return 10  # forest → forest clearance
    if "built" in s or c == "BU":
        return 1   # built-up → no conversion
    if "wetland" in s:
        return 21
    if "water" in s or c == "WB":
        return 23
    if "waste" in s or "barren" in s or c == "WL":
        return 16
    if "grass" in s or c == "GL":
        return 15  # grassland → NA order
    return None


async def fetch_lulc(
    lat: float, lon: float, client: httpx.AsyncClient
) -> tuple[str | None, int | None, str | None]:
    """
    Returns (lulc_label, lulc_code, vintage) or (None, None, None) on failure.

    Tries 2022-23 dataset first; falls back to 2019-20.
    Uses a small BBOX (±0.005° ≈ 550m) centred on the coordinate,
    3×3 pixel image, queries centre pixel (X=1, Y=1).
    """
    delta = 0.005
    bbox = f"{lon - delta},{lat - delta},{lon + delta},{lat + delta}"

    for layer, vintage in _LAYERS_PRIORITY:
        params = {
            "SERVICE":      "WMS",
            "VERSION":      "1.1.1",
            "REQUEST":      "GetFeatureInfo",
            "LAYERS":       layer,
            "QUERY_LAYERS": layer,
            "STYLES":       "",
            "BBOX":         bbox,
            "WIDTH":        "3",
            "HEIGHT":       "3",
            "X":            "1",
            "Y":            "1",
            "INFO_FORMAT":  "application/json",
            "SRS":          "EPSG:4326",
        }
        try:
            resp = await client.get(_BHUVAN_WMS, params=params, timeout=12)
            resp.raise_for_status()
            data = resp.json()
            features = data.get("features") or []
            if not features:
                # Layer exists but returned no features here — try the next layer
                continue
            props = features[0].get("properties") or {}

            # SISDP Phase-2 schema: hierarchical text classes (Level_I..IV) +
            # 2-letter LULC_1 code. Field casing varies (note "Level_lV").
            level_i = props.get("Level_I") or props.get("LEVEL_I") or ""
            lulc_1 = props.get("LULC_1") or props.get("lulc_1") or ""
            label = (
                props.get("Level_lV") or props.get("Level_IV")
                or props.get("Level_III") or props.get("Level_II")
                or level_i or props.get("LULC_3") or props.get("LULC_2") or lulc_1 or None
            )
            code = _category_code(str(level_i), str(lulc_1))
            if label is None and code is None:
                continue
            return (str(label) if label else f"LULC {lulc_1}"), code, vintage
        except Exception:
            continue  # Network error or parse failure — try next layer

    return None, None, None


def lulc_flags(code: int | None) -> tuple[bool, bool]:
    """Returns (na_order_required, forest_clearance_required)."""
    if code is None:
        return False, False
    entry = LULC_CODES.get(code)
    if entry is None:
        return False, False
    _, category, is_agri, is_forest = entry
    return category in _NA_CATEGORIES or is_agri, is_forest
