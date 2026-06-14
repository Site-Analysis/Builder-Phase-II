// Pure geo helpers for map overlays (lat/lng degrees, metres).

export type LatLng = [number, number];

// Move `dist` metres along `bearingDeg` (0 = N, clockwise) from `center`.
export function dest(center: LatLng, bearingDeg: number, distM: number): LatLng {
  const br = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(br)) / 111320;
  const dLng = (distM * Math.sin(br)) / (111320 * Math.cos((center[0] * Math.PI) / 180));
  return [center[0] + dLat, center[1] + dLng];
}

// Andrew's monotone-chain convex hull. Returns hull ring (no repeated last point).
export function convexHull(pts: LatLng[]): LatLng[] {
  if (pts.length < 3) return [...pts];
  const p = [...pts].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0])); // by lng, then lat
  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const lower: LatLng[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: LatLng[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// 2D cast-shadow silhouette of a footprint ring extruded to a point light at
// infinity: footprint swept along the shadow vector. Exact for convex rings.
export function shadowPolygon(ring: LatLng[], bearingDeg: number, lengthM: number): LatLng[] {
  if (ring.length < 3 || lengthM <= 0) return [];
  const moved = ring.map((p) => dest(p, bearingDeg, lengthM));
  return convexHull([...ring, ...moved]);
}
