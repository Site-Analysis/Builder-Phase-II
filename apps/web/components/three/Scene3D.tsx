"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SolarData } from "@/lib/stores/analysis";
import { sunAt, dayRange } from "@/lib/solar";
import { fetchBuildings } from "@/lib/osm";

interface Scene3DProps {
  center:  [number, number]; // [lat, lng]
  bufferM: number;
  mode:    "massing" | "diagram";
  solar:   SolarData | null;
  hour:    number;           // 0–23.9, drives sun position + shadows
  boundary?: [number, number][] | null; // drawn site ring [lat,lng][]; null → circle
}

const SKY_R     = 400;  // sky-dome radius (m)
const EARTH_R   = 6371000;
const SHADOW_RES = 2048; // shadow map resolution

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
function buildShadowGroup(
  buildings: Awaited<ReturnType<typeof fetchBuildings>>,
  originLat: number,
  originLng: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name  = "sat-bld-shadows";

  const mat  = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
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

  if (geos.length > 0) {
    try {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        group.add(mesh);
      }
    } catch {
      // Merge failed — add individually (slower but correct)
      geos.forEach((geo) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        group.add(mesh);
      });
    }
  }

  return group;
}

export function Scene3D({ center, bufferM, mode, solar, hour, boundary }: Scene3DProps) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<maplibregl.Map | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const sunRef      = useRef<THREE.DirectionalLight | null>(null);
  const sunSphRef   = useRef<THREE.Mesh | null>(null);
  const hourRef     = useRef(hour);
  const solarRef    = useRef<SolarData | null>(solar);

  // Stable signature so the scene rebuilds when the drawn site arrives/changes
  // even if the centroid equals the default centre.
  const boundarySig = boundary && boundary.length
    ? `${boundary.length}:${boundary[0].join(",")}`
    : "circle";

  // Sync hour + solar without remount — render loop reads refs each frame
  useEffect(() => { hourRef.current  = hour;  }, [hour]);
  useEffect(() => { solarRef.current = solar; }, [solar]);

  // ── Mode: toggle building layer visibility ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = mode === "massing" ? "visible" : "none";
    const apply = () => { if (map.getLayer("sat-buildings")) map.setLayoutProperty("sat-buildings", "visibility", vis); };
    map.isStyleLoaded() ? apply() : map.once("load", apply);
  }, [mode]);

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
        const r_h     = Math.cos(elR_rad) * SKY_R;
        pts.push(new THREE.Vector3(r_h * Math.sin(azR_rad), r_h * Math.cos(azR_rad), Math.sin(elR_rad) * SKY_R));
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

  // ── OSM building shadow meshes ────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    let cancelled = false;

    fetchBuildings(center[0], center[1], bufferM * 1.2)
      .then((buildings) => {
        if (cancelled || !sceneRef.current) return;
        const group = buildShadowGroup(buildings, center[0], center[1]);
        if (group.children.length > 0) {
          sceneRef.current.add(group);
          console.log(`[SAT-3D] shadow buildings: ${group.children.length} mesh(es), ${buildings.length} buildings`);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      const old = sceneRef.current?.getObjectByName("sat-bld-shadows");
      if (old) {
        old.traverse((c) => { (c as THREE.Mesh).geometry?.dispose(); });
        sceneRef.current?.remove(old);
      }
    };
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Main scene + map setup ────────────────────────────────────────────────
  useEffect(() => {
    const mapEl = mapDivRef.current;
    if (!mapEl) return;

    console.log("[SAT-3D] init center:", center[0].toFixed(5), center[1].toFixed(5));

    const scene  = new THREE.Scene();
    const camera = new THREE.Camera();
    sceneRef.current = scene;

    // ── Sun directional light ──────────────────────────────────────────────
    const sun = new THREE.DirectionalLight(0xfffaee, 1.4);
    sun.position.set(0.3, 1.0, 0.8);
    sun.castShadow                   = true;
    sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
    sun.shadow.camera.near           = 1;
    sun.shadow.camera.far            = bufferM * 5;
    sun.shadow.camera.left           = -bufferM * 1.5;
    sun.shadow.camera.right          =  bufferM * 1.5;
    sun.shadow.camera.top            =  bufferM * 1.5;
    sun.shadow.camera.bottom         = -bufferM * 1.5;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x7090b0, 0.7));
    sunRef.current = sun;

    // ── Mercator anchor ────────────────────────────────────────────────────
    const origin = maplibregl.MercatorCoordinate.fromLngLat({ lng: center[1], lat: center[0] }, 0);
    const mScale = origin.meterInMercatorCoordinateUnits();
    const ox = origin.x;
    const oy = origin.y;

    // ── Shadow-receiving ground plane (ShadowMaterial) ────────────────────
    // Receives shadows from sun; invisible except where shadows fall.
    const shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(bufferM * 3, bufferM * 3),
      new THREE.ShadowMaterial({ opacity: 0.35, transparent: true, depthTest: false, depthWrite: false }),
    );
    shadowGround.receiveShadow = true;
    shadowGround.renderOrder   = 0;
    scene.add(shadowGround);

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
    const key   = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    const style = key
      ? `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`
      : "https://demotiles.maplibre.org/style.json";

    const map = new maplibregl.Map({ container: mapEl, style, center: [center[1], center[0]] as [number, number], zoom: 16, pitch: 55, bearing: -20 });
    mapRef.current = map;

    let renderer: THREE.WebGLRenderer | null = null;
    let renderCount = 0;

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
        renderer.shadowMap.enabled   = true;
        renderer.shadowMap.type      = THREE.PCFShadowMap;
        renderer.setPixelRatio(window.devicePixelRatio);
      },

      render(gl, options: CustomRenderMethodInput) {
        if (!renderer) return;
        renderCount++;

        // ── Update sun position from slider state ──────────────────────────
        const sd = solarRef.current;
        const h  = hourRef.current;
        if (sd) {
          const { az, el } = sunAt(sd.equinox, h);
          const azRad = (az * Math.PI) / 180;
          const elRad = (el * Math.PI) / 180;
          if (el > 0) {
            const r_h = Math.cos(elRad);
            sun.position.set(r_h * Math.sin(azRad) * SKY_R, r_h * Math.cos(azRad) * SKY_R, Math.sin(elRad) * SKY_R);
            sunSph.position.copy(sun.position);
            sunSph.visible = true;
          } else {
            sunSph.visible = false;
          }
        }

        // ── Mercator camera matrix ─────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (map as any).transform;
        const mercMvpArr: ArrayLike<number> | null = t?.mercatorMatrix ?? t?.currentTransform?.mercatorMatrix ?? null;

        let m: THREE.Matrix4;
        let l: THREE.Matrix4;

        if (mercMvpArr) {
          m = new THREE.Matrix4().fromArray(mercMvpArr);
          l = new THREE.Matrix4().makeTranslation(ox, oy, 0).scale(new THREE.Vector3(mScale, -mScale, mScale));
          if (renderCount === 1) {
            const p = new THREE.Vector4(0, 0, 30, 1).applyMatrix4(m.clone().multiply(l.clone()));
            console.log(`[SAT-3D] mercatorMatrix ✓  box→NDC (${(p.x/p.w).toFixed(3)}, ${(p.y/p.w).toFixed(3)})`);
          }
        } else {
          const worldSize: number = t?.worldSize ?? 512 * Math.pow(2, map.getZoom());
          const mXY = mScale * worldSize;
          m = new THREE.Matrix4().fromArray(options.modelViewProjectionMatrix);
          l = new THREE.Matrix4().makeTranslation(ox * worldSize, oy * worldSize, 0).scale(new THREE.Vector3(mXY, -mXY, 1));
        }

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

      if (buildingSrc) {
        try {
          map.addLayer({
            id: "sat-buildings", type: "fill-extrusion",
            source: buildingSrc, "source-layer": "building", minzoom: 13,
            layout: { visibility: mode === "massing" ? "visible" : "none" },
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
        const ring: [number, number][] = (boundary && boundary.length >= 3)
          ? boundary.map(([la, lo]) => [lo, la])              // [lat,lng] → [lng,lat]
          : circleRing(center[1], center[0], bufferM);        // point site → circle
        const first = ring[0], last = ring[ring.length - 1];
        if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);

        map.addSource("sat-site", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
        });
        // Fill sits beneath the buildings so they occlude it (reads as ground);
        // the edge line goes on top so the site outline is always visible.
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
