// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SolarData, SolarPoint } from "@/lib/stores/analysis";
import { sunAt, dayRange, shadowLength } from "@/lib/solar";
import type { Building } from "@/lib/osm";

interface Scene3DProps {
  center:  [number, number]; // [lat, lng]
  bufferM: number;
  mode:    "massing" | "diagram";
  solar:   SolarData | null;
  hour:    number;           // 0–23.9, drives sun position + shadows
  boundary?: [number, number][] | null; // drawn site ring [lat,lng][]; null → circle
  dayPoints?: SolarPoint[] | null;       // accurate hourly az/el for the selected date
  showContext?: boolean;                 // surrounding-city massing (default on)
  onBearingChange?: (deg: number) => void; // live map bearing → compass widget
  northNonce?: number;                   // bump to animate the map back to north
}

const EARTH_R   = 6371000;

// Closed [lng,lat] ring approximating a circle of radius `radiusM` — used as the
// site polygon for point (radius) projects so the maplibre site layer is uniform.
function circleRing(lng: number, lat: number, radiusM: number, steps = 72): [number, number][] {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([
      lng + ((radiusM * Math.cos(a)) / (EARTH_R * cosLat)) * (180 / Math.PI),
      lat + ((radiusM * Math.sin(a)) / EARTH_R) * (180 / Math.PI),
    ]);
  }
  return ring;
}

// ── Build shadow-only THREE.js meshes from OSM buildings ─────────────────────
// Extract building footprints + heights from the basemap's own vector source —
// the geometry is already in the browser (the visible extrusions), so shadows
// align exactly with what's on screen and need no network/Overpass call.
function buildingsFromMap(map: maplibregl.Map, srcId: string): Building[] {
  let feats: ReturnType<maplibregl.Map["querySourceFeatures"]>;
  try {
    feats = map.querySourceFeatures(srcId, { sourceLayer: "building" });
  } catch {
    return [];
  }
  const out: Building[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    const g = f.geometry;
    if (!g) continue;
    const rings: number[][][] =
      g.type === "Polygon" ? [g.coordinates[0] as number[][]]
      : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]).map((p) => p[0] as number[][])
      : [];
    if (!rings.length) continue;
    // Dedupe features split across tile boundaries.
    const id = String(f.id ?? f.properties?.osm_id ?? `${rings[0][0]?.[0]},${rings[0][0]?.[1]}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const p = f.properties ?? {};
    const height = Number(p.render_height ?? p.height ?? 0) || null;
    for (const ring of rings) {
      if (ring.length < 3) continue;
      out.push({ ring: ring.map(([lon, lat]) => [lat, lon] as [number, number]), height });
    }
  }
  return out;
}

// Mean [lat,lng] of a footprint ring.
function ringCentroid(ring: [number, number][]): [number, number] {
  let la = 0, lo = 0;
  for (const [a, o] of ring) { la += a; lo += o; }
  return [la / ring.length, lo / ring.length];
}

// Planar distance (m) between two [lat,lng] points — exact at site scale.
function distM(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos((b[0] * Math.PI) / 180);
  const dx = (a[1] - b[1]) * cosLat * (Math.PI / 180) * EARTH_R;
  const dy = (a[0] - b[0]) * (Math.PI / 180) * EARTH_R;
  return Math.hypot(dx, dy);
}

// Ray-casting point-in-polygon. ring is [lat,lng][].
function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]; // lat, lng
    const [yj, xj] = ring[j];
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Ground-shadow projection (rendered as a native maplibre fill) ────────────
// THREE shadows do not work inside the maplibre custom layer (a 2nd mesh in the
// scene rasterises nothing), so cast shadows are computed on the CPU and drawn as
// a maplibre GeoJSON fill — geo-anchored, drift-free, 100% reliable.

// Andrew's monotone-chain convex hull over [lng,lat] points → closed ring.
function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const ring = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (ring.length) ring.push(ring[0]); // close
  return ring;
}

// GeoJSON FeatureCollection of cast-shadow polygons for the given buildings at the
// supplied sun azimuth (compass °) + elevation (°). Each shadow = convex hull of the
// footprint and its copy translated `shadowLength(h,el)` metres away from the sun.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildShadowFC(buildings: Building[], az: number, el: number): any {
  const features: unknown[] = [];
  if (el > 1) {
    const bRad = ((az + 180) * Math.PI) / 180; // shadow points away from the sun
    const sinB = Math.sin(bRad), cosB = Math.cos(bRad);
    for (const b of buildings) {
      const L = shadowLength(b.height ?? 10, el);
      if (L <= 0 || b.ring.length < 3) continue;
      const pts: [number, number][] = [];
      for (const [lat, lng] of b.ring) {
        const dLat = (L * cosB) / 111320;
        const dLng = (L * sinB) / (111320 * Math.cos((lat * Math.PI) / 180));
        pts.push([lng, lat]);                     // footprint vertex
        pts.push([lng + dLng, lat + dLat]);       // its shadow tip
      }
      const hull = convexHull(pts);
      if (hull.length >= 4) {
        features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hull] } });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

interface MassingOpts { name: string; castShadow: boolean; receiveShadow: boolean; shadowOnly?: boolean }

// Build a massing group from building footprints. `shadowOnly` makes the meshes
// invisible casters (the visible buildings come from the maplibre extrusions, so
// there's no z-fight) — they still cast onto the ground/shadow plane.
function buildMassingGroup(
  buildings: Building[],
  originLat: number,
  originLng: number,
  opts: MassingOpts,
): THREE.Group {
  const group = new THREE.Group();
  group.name  = opts.name;

  const mat  = opts.shadowOnly
    ? new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: "#EAEAE3", roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const geos: THREE.BufferGeometry[] = [];

  for (const b of buildings) {
    const h = b.height ?? 10;
    if (h <= 0 || b.ring.length < 3) continue;
    try {
      const shape = new THREE.Shape();
      let first = true;
      // ring is LatLng[] = [lat, lng][]; skip closing vertex (same as first)
      for (const [lat, lng] of b.ring.slice(0, -1)) {
        const x = (lng - originLng) * cosLat * (Math.PI / 180) * EARTH_R; // east (m)
        const y = (lat - originLat) * (Math.PI / 180) * EARTH_R;           // north (m)
        if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
      }
      geos.push(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }));
    } catch { /* skip malformed polygon */ }
  }

  const addMesh = (geo: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = opts.castShadow;
    mesh.receiveShadow = opts.receiveShadow;
    mesh.frustumCulled = false; // hand-set camera matrix breaks THREE frustum cull
    group.add(mesh);
  };

  if (geos.length > 0) {
    try {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (merged) addMesh(merged);
    } catch {
      // Merge failed — add individually (slower but correct)
      geos.forEach(addMesh);
    }
  }

  return group;
}

export function Scene3D({ center, bufferM, mode, solar, hour, boundary, dayPoints, showContext = true, onBearingChange, northNonce }: Scene3DProps) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<maplibregl.Map | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const sunRef      = useRef<THREE.DirectionalLight | null>(null);
  const sunSphRef   = useRef<THREE.Mesh | null>(null);
  const hourRef     = useRef(hour);
  const solarRef    = useRef<SolarData | null>(solar);
  const dayRef      = useRef<SolarPoint[] | null>(dayPoints ?? null);
  const modeRef     = useRef(mode);
  const ctxRef      = useRef(showContext);
  const onBearingRef = useRef(onBearingChange);

  // Sky-dome radius scaled to the site so the sun + arcs read as a hemisphere
  // around the site, not a tiny loop floating far overhead.
  const skyR   = Math.min(Math.max(bufferM * 1.25, 160), 450);
  const skyRef = useRef(skyR);

  // Stable signature so the scene rebuilds when the drawn site arrives/changes
  // even if the centroid equals the default centre.
  const boundarySig = boundary && boundary.length
    ? `${boundary.length}:${boundary[0].join(",")}`
    : "circle";

  // Sync hour + solar without remount — render loop reads refs each frame
  useEffect(() => { hourRef.current  = hour;  }, [hour]);
  useEffect(() => { solarRef.current = solar; }, [solar]);
  useEffect(() => { dayRef.current   = dayPoints ?? null; }, [dayPoints]);
  useEffect(() => { modeRef.current  = mode; }, [mode]);
  useEffect(() => { skyRef.current   = skyR; }, [skyR]);
  useEffect(() => { ctxRef.current   = showContext; }, [showContext]);
  useEffect(() => { onBearingRef.current = onBearingChange; }, [onBearingChange]);

  // Compass "reset north" — bump northNonce to animate the map back to bearing 0.
  useEffect(() => {
    if (!northNonce) return; // skip initial mount (nonce 0)
    mapRef.current?.rotateTo(0, { duration: 300 });
  }, [northNonce]);

  // ── Visibility: massing shows buildings + ground shadows; diagram hides them.
  // Surroundings toggle hides the context maplibre buildings.
  useEffect(() => {
    const site = sceneRef.current?.getObjectByName("sat-site-massing");
    if (site) site.visible = mode === "massing";
    const map = mapRef.current;
    const ctxVis    = (mode === "massing" && showContext) ? "visible" : "none";
    const shadowVis = mode === "massing" ? "visible" : "none";
    const apply = () => {
      if (map?.getLayer("sat-buildings"))    map.setLayoutProperty("sat-buildings", "visibility", ctxVis);
      if (map?.getLayer("sat-shadows-fill")) map.setLayoutProperty("sat-shadows-fill", "visibility", shadowVis);
    };
    if (map) (map.isStyleLoaded() ? apply() : map.once("load", apply));
  }, [mode, showContext]);

  // ── Solar arcs: inject / replace when solar data arrives ─────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !solar) return;

    const old = scene.getObjectByName("sat-arcs");
    if (old) {
      old.traverse((c) => { if ((c as THREE.Line).isLine) (c as THREE.Line).geometry.dispose(); });
      scene.remove(old);
    }

    const group = new THREE.Group();
    group.name  = "sat-arcs";

    const ARC_DEFS = [
      { data: solar.summer,  color: "#F4A259", opacity: 0.8 },
      { data: solar.equinox, color: "#C8D4C8", opacity: 0.7 },
      { data: solar.winter,  color: "#7BB7D4", opacity: 0.75 },
    ];

    for (const { data, color, opacity } of ARC_DEFS) {
      const { start, end } = dayRange(data);
      const pts: THREE.Vector3[] = [];
      for (let h = start; h <= end; h += 0.2) {
        const { az, el } = sunAt(data, h);
        if (el <= 0) continue;
        const azR_rad = (az * Math.PI) / 180;
        const elR_rad = (el * Math.PI) / 180;
        const r_h     = Math.cos(elR_rad) * skyR;
        pts.push(new THREE.Vector3(r_h * Math.sin(azR_rad), r_h * Math.cos(azR_rad), Math.sin(elR_rad) * skyR));
      }
      if (pts.length < 2) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      line.renderOrder = 4;
      group.add(line);
    }

    scene.add(group);
    return () => {
      group.traverse((c) => { if ((c as THREE.Line).isLine) (c as THREE.Line).geometry.dispose(); });
      sceneRef.current?.remove(group);
    };
  }, [solar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Highlighted arc for the selected date ─────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const old = scene.getObjectByName("sat-day-arc");
    if (old) {
      (old as THREE.Line).geometry?.dispose();
      scene.remove(old);
    }
    if (!dayPoints || dayPoints.length < 2) return;

    const { start, end } = dayRange(dayPoints);
    const pts: THREE.Vector3[] = [];
    for (let h = start; h <= end; h += 0.2) {
      const { az, el } = sunAt(dayPoints, h);
      if (el <= 0) continue;
      const azR = (az * Math.PI) / 180;
      const elR = (el * Math.PI) / 180;
      const rh  = Math.cos(elR) * skyR;
      pts.push(new THREE.Vector3(rh * Math.sin(azR), rh * Math.cos(azR), Math.sin(elR) * skyR));
    }
    if (pts.length < 2) return;

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: "#F4A259", transparent: true, opacity: 0.95, depthTest: false }),
    );
    line.name = "sat-day-arc";
    line.renderOrder = 5;
    scene.add(line);

    return () => {
      (line.geometry as THREE.BufferGeometry).dispose();
      sceneRef.current?.remove(line);
    };
  }, [dayPoints]);

  // ── Main scene + map setup ────────────────────────────────────────────────
  useEffect(() => {
    const mapEl = mapDivRef.current;
    if (!mapEl) return;

    const scene  = new THREE.Scene();
    const camera = new THREE.Camera();
    sceneRef.current = scene;

    // ── Sun directional light (building face shading only — ground shadows are
    // a native maplibre fill; no THREE shadow-mapping). ────────────────────
    const lightDist = 1000; // metres — only the DIRECTION matters for shading
    const sun = new THREE.DirectionalLight(0xfffaee, 1.4);
    sun.position.set(0.3, 1.0, 0.8);
    scene.add(sun);
    scene.add(sun.target);
    scene.add(new THREE.AmbientLight(0x7090b0, 0.7));
    sunRef.current = sun;

    // ── Mercator anchor ────────────────────────────────────────────────────
    const origin = maplibregl.MercatorCoordinate.fromLngLat({ lng: center[1], lat: center[0] }, 0);
    const mScale = origin.meterInMercatorCoordinateUnits();
    const ox = origin.x;
    const oy = origin.y;

    // ── Selected site ────────────────────────────────────────────────────
    // Rendered as a NATIVE maplibre fill+line layer (added in map.on("load"))
    // so it is geo-anchored to the basemap and never drifts with zoom/pan.
    // (Previously a THREE overlay, which floated over the buildings and appeared
    // to swim around the map.)

    // ── Azimuth ticks (single LineSegments = 1 draw call) ─────────────────
    const azR = bufferM + 35;
    const tickVerts: number[] = [];
    for (let bearing = 0; bearing < 360; bearing += 10) {
      const rad    = ((90 - bearing) * Math.PI) / 180;
      const cos    = Math.cos(rad);
      const sin    = Math.sin(rad);
      const isCard = bearing % 90 === 0;
      const inner  = azR - (isCard ? 30 : 16);
      tickVerts.push(cos * inner, sin * inner, 0, cos * azR, sin * azR, 0);
    }
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tickVerts, 3));
    const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: "#7A8F84", transparent: true, opacity: 0.75, depthTest: false }));
    ticks.renderOrder = 3;
    scene.add(ticks);

    const azPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      azPts.push(new THREE.Vector3(Math.cos(a) * azR, Math.sin(a) * azR, 0));
    }
    const azCircle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(azPts), new THREE.LineBasicMaterial({ color: "#7A8F84", transparent: true, opacity: 0.45, depthTest: false }));
    azCircle.renderOrder = 3;
    scene.add(azCircle);

    // ── Sun sphere ─────────────────────────────────────────────────────────
    const sunSph = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 8), new THREE.MeshBasicMaterial({ color: "#FFF0A0", depthTest: false }));
    sunSph.renderOrder   = 5;
    sunSph.frustumCulled = false;
    sunSph.visible       = false;
    scene.add(sunSph);
    sunSphRef.current = sunSph;

    // ── MapLibre map ───────────────────────────────────────────────────────
    const style = "https://tiles.openfreemap.org/styles/liberty";

    const map = new maplibregl.Map({ container: mapEl, style, center: [center[1], center[0]] as [number, number], zoom: 16, pitch: 45, bearing: -20 });
    mapRef.current = map;

    let renderer: THREE.WebGLRenderer | null = null;
    // Site buildings (for shadow projection) + a key so shadows recompute only when
    // the sun moves ≥1° or the building set changes (not every frame).
    let siteBuildings: Building[] = [];
    let lastShadowKey = "";

    const layer: CustomLayerInterface = {
      id: "sat-3d-driver",
      type: "custom",
      renderingMode: "3d",

      onAdd(_map, gl) {
        renderer = new THREE.WebGLRenderer({ canvas: gl.canvas as HTMLCanvasElement, context: gl, antialias: true });
        renderer.autoClear           = false;
        renderer.toneMapping         = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace    = THREE.SRGBColorSpace;
      },

      render(gl, options: CustomRenderMethodInput) {
        if (!renderer) return;

        // ── Update sun position from slider state ──────────────────────────
        const day = dayRef.current;
        const sd  = solarRef.current;
        // Prefer the accurate selected-date curve; fall back to the equinox arc.
        const src = day && day.length ? day : sd?.equinox ?? null;
        const h   = hourRef.current;
        if (src) {
          const { az, el } = sunAt(src, h);
          const azRad = (az * Math.PI) / 180;
          const elRad = (el * Math.PI) / 180;
          if (el > 0) {
            const ch = Math.cos(elRad);
            const dx = ch * Math.sin(azRad), dy = ch * Math.cos(azRad), dz = Math.sin(elRad);
            // Light direction → building face shading (distance is irrelevant).
            sun.position.set(dx * lightDist, dy * lightDist, dz * lightDist);
            // Sun sphere on the visual sky dome.
            const Rv = skyRef.current;
            sunSph.position.set(dx * Rv, dy * Rv, dz * Rv);
            sunSph.visible = true;
          } else {
            sunSph.visible = false;
          }

          // ── Ground shadows: native maplibre fill, projected from site buildings.
          // Self-throttled: recompute only when the sun moves ≥1° or buildings change.
          const key = `${Math.round(az)},${Math.round(el)},${siteBuildings.length}`;
          if (key !== lastShadowKey) {
            lastShadowKey = key;
            const fc = buildShadowFC(siteBuildings, az, el);
            (map.getSource("sat-shadows") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
          }
        }

        // ── Camera matrix (maplibre 5.24 custom-layer world→clip) ──────────
        // The version-matched NullIsland custom-layer example (maplibre-gl.d.ts)
        // uses `options.modelViewProjectionMatrix`, whose shader places a vertex at
        // `u_matrix * vec4(0.5,0.5,0,1)` = the mercator world centre — i.e. this
        // matrix maps spherical-mercator [0,1] coords → clip space. (`defaultProjection
        // Data.mainMatrix` is a DIFFERENT, differently-scaled matrix → balloon/drift.)
        // `l` maps the local ENU-metre scene → mercator [0,1]: translate to the site's
        // mercator origin, scale metres→mercator units (−Y: mercator Y grows south;
        // +X east, +Z up = the Z-up extruded massing). Single source, no fallback.
        const opt = options as unknown as { modelViewProjectionMatrix: ArrayLike<number> };
        const mvp = opt.modelViewProjectionMatrix;
        const m = new THREE.Matrix4().fromArray(mvp as number[]);
        const l = new THREE.Matrix4()
          .makeTranslation(ox, oy, 0)
          .scale(new THREE.Vector3(mScale, -mScale, mScale));
        camera.projectionMatrix = m.multiply(l);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

        // ── Render ─────────────────────────────────────────────────────────
        // IMPORTANT: setViewport AFTER resetState — resetState clears the
        // tracked viewport; shadow pass saves/restores it, so it must be set
        // AFTER reset to survive the shadow pass and be used for main render.
        renderer.resetState();
        renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.render(scene, camera);
        map.triggerRepaint();
      },

      onRemove() { renderer?.dispose(); renderer = null; },
    };

    map.on("load", () => {
      const styleSources = map.getStyle()?.sources ?? {};
      const sourceNames  = Object.keys(styleSources);
      const buildingSrc  = sourceNames.includes("openmaptiles")
        ? "openmaptiles"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : sourceNames.find((k) => (styleSources[k] as any)?.type === "vector") ?? null;

      // Site polygon ([lng,lat], closed) — shared by the buildings within-filter,
      // the site outline layer, and the inSite test.
      const siteRingLL: [number, number][] = (boundary && boundary.length >= 3)
        ? boundary.map(([la, lo]) => [lo, la])               // [lat,lng] → [lng,lat]
        : circleRing(center[1], center[0], bufferM);         // point site → circle
      {
        const f = siteRingLL[0], l2 = siteRingLL[siteRingLL.length - 1];
        if (f && l2 && (f[0] !== l2[0] || f[1] !== l2[1])) siteRingLL.push([f[0], f[1]]);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siteGeom: any = { type: "Polygon", coordinates: [siteRingLL] };

      // ── Ground shadows (native maplibre fill, lowest custom layer) ────────
      // Added first so it sits under the context buildings, the site polygon and
      // the THREE massing — shadows lie on the ground, buildings rise above them.
      try {
        map.addSource("sat-shadows", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "sat-shadows-fill", type: "fill", source: "sat-shadows",
          layout: { visibility: mode === "massing" ? "visible" : "none" },
          paint: { "fill-color": "#1C2630", "fill-opacity": 0.26 },
        });
      } catch (err) { console.warn("[SAT-3D] shadows layer:", err); }

      if (buildingSrc) {
        try {
          map.addLayer({
            id: "sat-buildings", type: "fill-extrusion",
            source: buildingSrc, "source-layer": "building", minzoom: 13,
            // Surrounding buildings only — the site buildings are drawn as THREE
            // massing (lit + shadowed), so exclude them here to avoid z-fight.
            filter: ["!", ["within", siteGeom]] as unknown as maplibregl.FilterSpecification,
            layout: { visibility: (mode === "massing" && showContext) ? "visible" : "none" },
            paint: {
              "fill-extrusion-color": "#E8E8E0",
              "fill-extrusion-height":  ["coalesce", ["get", "render_height"],  ["get", "height"],     10] as maplibregl.ExpressionSpecification,
              "fill-extrusion-base":    ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0 ] as maplibregl.ExpressionSpecification,
              "fill-extrusion-opacity": 0.9,
            },
          });
        } catch (err) { console.warn("[SAT-3D] buildings:", err); }
      }

      // ── Selected site boundary — native maplibre layer (geo-anchored) ────
      try {
        map.addSource("sat-site", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: siteGeom },
        });
        const beforeId = map.getLayer("sat-buildings") ? "sat-buildings" : undefined;
        map.addLayer({
          id: "sat-site-fill", type: "fill", source: "sat-site",
          paint: { "fill-color": "#2B8ADE", "fill-opacity": 0.12 },
        }, beforeId);
        map.addLayer({
          id: "sat-site-line", type: "line", source: "sat-site",
          paint: { "line-color": "#2B8ADE", "line-width": 2.5, "line-opacity": 0.9 },
        });
      } catch (err) { console.warn("[SAT-3D] site layer:", err); }

      map.addLayer(layer);

      // Surface live bearing to the compass widget (initial + on every rotation).
      onBearingRef.current?.(map.getBearing());
      map.on("rotate", () => onBearingRef.current?.(map.getBearing()));

      // Build the THREE site massing from the basemap's own building tiles, and
      // feed the same site buildings to the ground-shadow projection. Rebuilt on
      // every pan/zoom settle so newly-loaded tiles are included. Only buildings
      // inside the marker are used, so shadows are generated ONLY for the site.
      if (buildingSrc) {
        const siteRing = boundary && boundary.length >= 3 ? boundary : null;
        const hit = (lat: number, lng: number): boolean =>
          siteRing ? pointInRing(lat, lng, siteRing) : distM([lat, lng], center) <= bufferM;
        // A building belongs to the site if its centroid OR any vertex is inside
        // the marker — so large buildings overlapping a small site still count.
        const inSite = (b: Building): boolean => {
          const c = ringCentroid(b.ring);
          return hit(c[0], c[1]) || b.ring.some(([lat, lng]) => hit(lat, lng));
        };
        const refreshMassing = (): boolean => {
          const scene = sceneRef.current;
          if (!scene) return false;
          const all = buildingsFromMap(map, buildingSrc);
          if (!all.length) return false;   // building tiles not loaded yet
          const siteB = all.filter(inSite);

          const old = scene.getObjectByName("sat-site-massing");
          if (old) {
            old.traverse((c) => { (c as THREE.Mesh).geometry?.dispose(); });
            scene.remove(old);
          }

          // Visible site massing, lit by the sun. Surrounding buildings are the
          // maplibre extrusions (excluded via the within-filter), so there's no z-fight.
          const siteGrp = buildMassingGroup(siteB, center[0], center[1], {
            name: "sat-site-massing", castShadow: false, receiveShadow: false,
          });
          siteGrp.visible = modeRef.current === "massing";
          if (siteGrp.children.length) scene.add(siteGrp);

          // Feed the ground-shadow projection (recomputed in the render loop) and
          // force a recompute now that the building set changed.
          siteBuildings = siteB;
          lastShadowKey = "";
          return true;
        };

        // The custom layer self-repaints every frame, so the map never goes
        // "idle". Instead: retry until building tiles are loaded (initial build),
        // then rebuild on every pan/zoom settle so new tiles are included.
        let tries = 0;
        const tryInit = () => {
          if (!sceneRef.current || tries++ > 40) return;
          if (!refreshMassing()) setTimeout(tryInit, 250);
        };
        tryInit();
        map.on("moveend", refreshMassing);
      }
    });

    return () => {
      sceneRef.current  = null;
      sunRef.current    = null;
      sunSphRef.current = null;
      mapRef.current    = null;
      renderer?.dispose();
      renderer = null;
      map.remove();
    };
  }, [center[0], center[1], boundarySig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />;
}
