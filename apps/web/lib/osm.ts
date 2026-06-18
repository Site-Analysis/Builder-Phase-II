// Client-side OpenStreetMap helpers — building footprints (Overpass) + reverse
// geocoding (Nominatim). Both fail gracefully (empty result) on network errors.

import type { LatLng } from "./geo";

export interface Building {
  ring: LatLng[];        // [lat, lng] footprint
  height: number | null; // metres, or null when OSM has no height/levels tag
}

// overpass-api.de is 406/504-blocked in some networks; the FR mirror works and
// the browser supplies a real User-Agent (no 403). Keep .de as a fallback.
const OVERPASS_PRIMARY = "https://overpass.openstreetmap.fr/api/interpreter";
const OVERPASS_FALLBACK = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const MAX_BUILDINGS = 400;

interface OverpassNode { lat: number; lon: number }
interface OverpassEl {
  type: string;
  geometry?: OverpassNode[];
  tags?: Record<string, string>;
}

function parseHeight(tags?: Record<string, string>): number | null {
  if (!tags) return null;
  if (tags.height) {
    const h = parseFloat(tags.height.replace(/[^\d.]/g, ""));
    if (Number.isFinite(h) && h > 0) return h;
  }
  if (tags["building:levels"]) {
    const lv = parseFloat(tags["building:levels"]);
    if (Number.isFinite(lv) && lv > 0) return lv * 3;
  }
  return null;
}

const buildingCache = new Map<string, Building[]>();

export async function fetchBuildings(lat: number, lng: number, radiusM: number): Promise<Building[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusM}`;
  const hit = buildingCache.get(key);
  if (hit) return hit;

  const query = `[out:json][timeout:25];(way["building"](around:${radiusM},${lat},${lng}););out geom;`;
  const body = `data=${encodeURIComponent(query)}`;
  const post = (url: string) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  try {
    let res = await post(OVERPASS_PRIMARY).catch(() => null);
    if (!res || !res.ok) res = await post(OVERPASS_FALLBACK).catch(() => null);
    if (!res || !res.ok) return [];
    const data: { elements?: OverpassEl[] } = await res.json();
    const out: Building[] = [];
    for (const el of data.elements ?? []) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 3) continue;
      out.push({
        ring: el.geometry.map((g) => [g.lat, g.lon] as LatLng),
        height: parseHeight(el.tags),
      });
    }
    // Nearest-first, capped, so dense cities stay performant.
    out.sort((a, b) => dist2(a.ring[0], lat, lng) - dist2(b.ring[0], lat, lng));
    const capped = out.slice(0, MAX_BUILDINGS);
    buildingCache.set(key, capped);
    return capped;
  } catch {
    return [];
  }
}

function dist2(p: LatLng, lat: number, lng: number): number {
  const dy = p[0] - lat, dx = p[1] - lng;
  return dy * dy + dx * dx;
}

const geocodeCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = geocodeCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return "";
    const data: { address?: Record<string, string> } = await res.json();
    const a = data.address ?? {};
    const place = a.city || a.town || a.village || a.county || a.state_district || a.state || "";
    const label = [place, a.country].filter(Boolean).join(", ");
    geocodeCache.set(key, label);
    return label;
  } catch {
    return "";
  }
}
