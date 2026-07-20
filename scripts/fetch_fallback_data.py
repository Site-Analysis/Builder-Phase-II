# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Fetch / verify the non-KGIS fallback data layers (download-on-setup — NOT committed).

``lgd_villages.geojson`` (65 MB, 30,416 features) is a reproducible open-data artifact and is
**gitignored** (see ``.gitignore`` + ``services/geo/app/data/FALLBACK_SOURCES.md``) — not
source-of-record, so it is re-fetchable rather than stored in git history (no Git LFS).

This script places + VALIDATES the layer, and NEVER silently succeeds on a missing/wrong file:
  * missing            -> prints manual fetch instructions + expected path/count, exits 2;
  * wrong / corrupt    -> bad feature count, non-4326 CRS, or the lat/lon KA-bounds swap
                          canary -> exits 1 (loud);
  * valid              -> exits 0.

Access:   bharatlas viewer -> Karnataka slice (manual export; the viewer isn't scriptable).
Upstream: LGD via ramSeraph/indian_admin_boundaries.   Licence: CC0.

Usage:
    python scripts/fetch_fallback_data.py               # verify the bundled villages layer
    python scripts/fetch_fallback_data.py --source X    # copy X into place, then verify
    python scripts/fetch_fallback_data.py --file X      # verify an arbitrary path (test hook)
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_GEO = _ROOT / "services" / "geo"
_VILLAGES = _GEO / "app" / "data" / "lgd_villages.geojson"
_EXPECT_COUNT = 30416

# Reuse the fallback engine's loader (coordinate normalization + KA-bounds canary).
sys.path.insert(0, str(_GEO))
sys.modules.pop("app", None)
from app.services import fallback_geojson as fb  # noqa: E402

_MANUAL = f"""\
MISSING: lgd_villages.geojson is not present (gitignored, 65 MB — download-on-setup).
Fetch it manually:
  1. Open the bharatlas viewer; select the KARNATAKA slice of the LGD village layer
     (upstream: LGD via ramSeraph/indian_admin_boundaries; licence CC0).
  2. Export as GeoJSON in WGS84 / EPSG:4326 (standard [lon, lat] order).
  3. Save as: {_VILLAGES}
  4. Re-run: python scripts/fetch_fallback_data.py   (expects {_EXPECT_COUNT} features)
"""


def _check_crs(path: Path) -> None:
    crs = json.loads(path.read_text(encoding="utf-8")).get("crs")
    if crs:
        blob = json.dumps(crs)
        if "4326" not in blob and "CRS84" not in blob:
            sys.exit(f"FAIL: {path.name} declares a non-4326 CRS: {blob}")


def validate(path: Path) -> None:
    if not path.exists():
        print(_MANUAL)
        sys.exit(2)  # missing — never a silent success
    _check_crs(path)
    try:
        feats = fb.load(path, coord_order="lonlat")  # runs the lat/lon KA-bounds swap canary
    except fb.FallbackLayerError as exc:
        sys.exit(f"FAIL: {path.name} failed the coordinate/bounds canary: {exc}")
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"FAIL: {path.name} unreadable: {type(exc).__name__}: {exc}")
    n = len(feats)
    if n != _EXPECT_COUNT:
        sys.exit(f"FAIL: {path.name} has {n} features, expected {_EXPECT_COUNT} (wrong/corrupt download)")
    print(f"OK: {path.name} — {n} features, EPSG:4326, KA-bounds canary passed.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch/verify fallback data (download-on-setup)")
    ap.add_argument("--source", help="copy this file into the villages target, then verify")
    ap.add_argument("--file", default=str(_VILLAGES), help="verify this path (default: bundled villages)")
    args = ap.parse_args()

    target = Path(args.file)
    if args.source:
        target = _VILLAGES
        shutil.copyfile(args.source, target)
        print(f"copied {args.source} -> {target}")
    validate(target)


if __name__ == "__main__":
    main()
