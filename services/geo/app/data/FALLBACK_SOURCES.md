# Non-KGIS fallback data layers (inferred tier)

The `fallback_geojson` engine reads bundled open-data GeoJSON layers as the **second tier**
behind the KGIS-live seam. Everything answered from here is `confidence="inferred"`,
`mode="inferred-fallback"`, with `data_vintage` = the source's real snapshot date. **A layer
that isn't bundled returns `unresolved` (loud), never a default. On OUR confidence ladder
these are `inferred` regardless of any upstream "authoritative" label — do not promote.**

Coordinate order is **per-layer** (`load(coord_order=...)`); the Karnataka-bounds canary
fails loud on a lat/lon swap. **Never edit the data to fix an order problem — configure the loader.**

| File (`services/geo/app/data/`) | Upstream source | Access route | Licence | Vintage | Features | `coord_order` | name field(s) | Serves | Status |
|---|---|---|---|---|---|---|---|---|---|
| `wards_bengaluru_gba.geojson` | GBA/BBMP ward delimitation 2025 (KML-derived) | OpenCity | ODbL / OpenCity | **2025** | **369** | **`latlon`** → normalized | `ward_name` (+ `ward_id`, `Corporation`, `zone`, `zone_name`, `ward_name_kn`) | US-093 authority (local-body) PIP | **LOADED** ✅ |
| `lgd_villages.geojson` | LGD (ramSeraph/indian_admin_boundaries) | bharatlas | CC0 | **LGD-2024** | **30,416** | `lonlat` | `vilname11` (alt `vilnam_soi`) · LGD `vil_lgd` (+ state/dist/subdt/block/gp chain) | US-080 lat/lon→village **context** (NOT `KGISVillageID`) | **LOADED** ✅ |
| `lpa_bda.geojson` | one-time digitized BDA LPA | — | digitized (inferred) | — | — | — | — | US-093 planning-authority PIP | **PENDING DIGITIZATION** |
| `lpa_bmrda.geojson` | one-time digitized BMRDA area | — | digitized (inferred) | — | — | — | — | US-093 planning-authority PIP | **PENDING DIGITIZATION** |
| `lpa_biaapa.geojson` | one-time digitized BIAAPA area | — | digitized (inferred) | — | — | — | — | US-093 planning-authority PIP | **PENDING DIGITIZATION** |
| `panchayats_karnataka.geojson` | LGD / DataMeet (source TBD) | verify | verify | — | — | — | — | US-093 rural local-body PIP | **PENDING DIGITIZATION** |

## Coordinate-order + field handling (validated 2026-07-20)
- **wards** ship KML-derived **`[lat, lon]`** (first coord `[12.9554, 77.5117]`). Loaded with
  `coord_order="latlon"` → normalized to internal `[lon, lat]`. The canary **fails loud** if
  loaded as `lonlat` (regression-tested). Verified: `12.9716 N, 77.5946 E` → ward
  **"Ashokanagar" / Corporation "Central"** (inferred, vintage 2025).
- **villages** ship standard **`[lon, lat]`** (first coord `[74.5359, 14.0085]`). Loaded with
  `coord_order="lonlat"`. Verified: `12.9716 N, 77.5946 E` → **"BBMP (M Corp. + OG)"**,
  `vil_lgd 803162` (LGD models BBMP urban as one entity — inferred, vintage LGD-2024).

## Honest-degradation cases (no vector fallback exists)
- **Parcel geometry (US-080):** there is **no public vector equivalent** for a cadastral
  parcel polygon. The fallback is **NOT a synthesized parcel** — it is honest degradation:
  user-drawn polygon + Bhoomi RTC area cross-check + Dishaank deep-link. Service returns
  `unresolved` with that `next_action`. (Village-context fallback above does NOT yield a
  parcel polygon or a `KGISVillageID`.)

## ⚠ Repo hygiene — villages is download-on-setup, NOT committed
`lgd_villages.geojson` is **65 MB** and is **gitignored** (see `.gitignore`) — a reproducible
open-data artifact, not source-of-record. Do **not** commit it (no Git LFS either). Fetch +
validate it at setup:

    python scripts/fetch_fallback_data.py

- **Access:** bharatlas viewer → Karnataka slice (manual export; the viewer isn't scriptable).
- **Upstream:** LGD via `ramSeraph/indian_admin_boundaries`. **Licence:** CC0.
- The script asserts **30,416 features + EPSG:4326 + the lat/lon KA-bounds canary**, so a
  wrong/corrupt download **fails loud at setup**, not at runtime. Missing file → prints fetch
  instructions + exits non-zero (never a silent success).

`wards_bengaluru_gba.geojson` (2.9 MB, ODbL) **is committable and stays tracked** — not ignored.

## Adding a layer
1. Download/digitize into the target path; confirm licence + snapshot date + coordinate order.
2. Set `data_vintage` at the caller; GBA-corporation/ward layers must be **≥ 2025-05-15**.
3. Configure `coord_order` per layer; the canary rejects a swapped file rather than mislocate.
