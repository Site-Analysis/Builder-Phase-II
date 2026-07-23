# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Geo `zone_class` → planning FAR zone bridge (US-088 dry-run G2).

The geo service emits a broad `zone_class` vocabulary (Residential, Commercial, Water Body,
Green Belt, Agricultural, …). The RMP FAR tables only cover the developable planning zones.
This maps the two HONESTLY:

  * a developable zone  -> its planning zone name (identity for the 5 shared names);
  * a non-developable zone (Water Body / Green Belt / Agricultural / Restricted / Unknown …)
    -> (None, developable=False, reason) so the caller returns a clean "no FAR table applies —
    not developable under RMP" result. NEVER coerce to the nearest developable zone, and never
    let it 422 the FAR endpoint.
"""

from __future__ import annotations

# geo zone_class values that ARE developable planning zones (identity map).
_DEVELOPABLE = {
    "Residential": "Residential",
    "Commercial": "Commercial",
    "Industrial": "Industrial",
    "Mixed Use": "Mixed Use",
    "Institutional": "Institutional",
}

# geo zone_class values that carry NO RMP FAR table — developable=False, with the honest reason.
_NOT_DEVELOPABLE = {
    "Water Body": "a water body / its buffer — no development permitted",
    "Green Belt": "green belt / open-space reservation — no FAR table applies",
    "Agricultural": "agricultural land — NA (non-agricultural) conversion is required before any "
    "RMP FAR applies",
    "Restricted": "a restricted zone — development is barred / regulated separately",
    "Unknown": "an undetermined zone — resolve the RMP land-use before any FAR",
    "Unclassified": "unclassified land — confirm the RMP land-use zone",
}


def map_geo_zone(zone_class: str | None) -> tuple[str | None, bool, str | None]:
    """Return (planning_zone, developable, reason).

    developable=True  -> planning_zone is set, reason None.
    developable=False -> planning_zone None, reason explains why no FAR table applies.
    """
    z = (zone_class or "").strip()
    if z in _DEVELOPABLE:
        return _DEVELOPABLE[z], True, None
    if z in _NOT_DEVELOPABLE:
        return None, False, f"{z}: {_NOT_DEVELOPABLE[z]} (not developable under RMP-2015)"
    return None, False, (
        f"{z or '(empty)'}: no RMP FAR-table mapping for this zone — confirm the RMP land-use "
        "zone with the authority (not coerced to a nearest developable zone)"
    )
