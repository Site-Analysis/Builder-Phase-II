// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMap, Rectangle, Circle, Polygon, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Square, PenTool, Trash2, MousePointer2 } from "lucide-react";
import { useDrawStore } from "@/lib/stores/draw";

type LatLng = [number, number];
type Mode = "rect" | "circle" | "poly" | null;

type DraftShape =
  | { kind: "rect"; bounds: [LatLng, LatLng] }
  | { kind: "circle"; center: LatLng; radius: number }
  | { kind: "poly"; positions: LatLng[] };
type Shape = DraftShape & { id: number };

const STROKE = "#306223";       // brand primary
const FILL   = "#99CDD8";       // brand secondary
const PATH   = { color: STROKE, weight: 2, fillColor: FILL, fillOpacity: 0.18 } as const;
const DRAFT  = { color: STROKE, weight: 2, dashArray: "6 5", fillColor: FILL, fillOpacity: 0.10 } as const;

// ── Measurement utilities ──────────────────────────────────────────────────────
function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
function fmtArea(m2: number) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2)} m²`;
}
function brng(a: LatLng, b: LatLng) {
  const [la, lo] = [a[0] * Math.PI / 180, a[1] * Math.PI / 180];
  const [lb, ln] = [b[0] * Math.PI / 180, b[1] * Math.PI / 180];
  const y = Math.sin(ln - lo) * Math.cos(lb);
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(ln - lo);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
function interiorAngle(a: LatLng, b: LatLng, c: LatLng) {
  let d = Math.abs(brng(b, c) - brng(b, a)) % 360;
  if (d > 180) d = 360 - d;
  return Math.round(d);
}
function polyAreaM2(pts: LatLng[]) {
  if (pts.length < 3) return 0;
  const R = 6371000;
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180;
  const cosL = Math.cos(lat0);
  const xy = pts.map(p => [p[1] * Math.PI / 180 * R * cosL, p[0] * Math.PI / 180 * R]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    area += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1];
  }
  return Math.abs(area / 2);
}
function polyPerimM(pts: LatLng[], map: L.Map) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) sum += map.distance(pts[i], pts[i + 1]);
  return sum;
}

function renderMeasure(pts: LatLng[], cur: LatLng | null, map: L.Map, el: HTMLDivElement | null) {
  if (!el) return;
  el.innerHTML = "";
  if (pts.length === 0 && !cur) return;
  const all = cur ? [...pts, cur] : pts;

  // Segment midpoint length labels
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i], b = all[i + 1];
    const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const px = map.latLngToContainerPoint(mid);
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-50%);` +
      `background:rgba(253,252,251,0.93);border:1.5px solid ${STROKE};color:#3A3F3B;` +
      `font:600 10px/1.4 system-ui;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none;`;
    d.textContent = fmtDist(map.distance(a, b));
    el.appendChild(d);
  }

  // Vertex angle labels at placed vertices (skip first and last of all[])
  for (let i = 1; i < pts.length; i++) {
    if (i >= all.length - 1) continue;
    const angle = interiorAngle(pts[i - 1], pts[i], all[i + 1]);
    const px = map.latLngToContainerPoint(pts[i]);
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;left:${px.x + 6}px;top:${px.y - 14}px;` +
      `background:rgba(48,98,35,0.13);border:1px solid rgba(48,98,35,0.35);color:${STROKE};` +
      `font:600 10px/1.4 system-ui;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none;`;
    d.textContent = `${angle}°`;
    el.appendChild(d);
  }

  // Cursor tooltip
  if (cur && pts.length > 0) {
    const px = map.latLngToContainerPoint(cur);
    const last = pts[pts.length - 1];
    const lines = [`↔ ${fmtDist(map.distance(last, cur))}`];
    if (pts.length >= 2) lines.push(`∠ ${interiorAngle(pts[pts.length - 2], last, cur)}°`);
    if (all.length >= 3) {
      lines.push(`▣ ${fmtArea(polyAreaM2(all))}`);
      lines.push(`⌁ ${fmtDist(polyPerimM(all, map))}`);
    }
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;left:${px.x + 14}px;top:${px.y - 8}px;` +
      `background:rgba(48,98,35,0.90);color:#fff;font:600 11px/1.7 system-ui;` +
      `padding:4px 9px;border-radius:6px;white-space:nowrap;pointer-events:none;` +
      `box-shadow:0 2px 8px rgba(0,0,0,0.22);`;
    d.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
    el.appendChild(d);
  }
}

function renderStaticMeasure(
  positions: LatLng[] | null,
  measurements: { area: number; perimeter: number } | null,
  map: L.Map,
  el: HTMLDivElement | null,
  visible: boolean,
) {
  if (!el) return;
  el.innerHTML = "";
  if (!visible || !positions || positions.length < 2 || !measurements) return;

  // Segment length label at each edge midpoint — only when segment is long enough on screen
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % positions.length];
    const pa = map.latLngToContainerPoint(a);
    const pb = map.latLngToContainerPoint(b);
    const segPx = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (segPx < 70) continue; // too short to label without crowding
    const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const px = map.latLngToContainerPoint(mid);
    const dist = map.distance(a, b);
    const d = document.createElement("div");
    d.style.cssText =
      `position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-50%);` +
      `background:rgba(253,252,251,0.95);border:1.5px solid ${STROKE};color:#3A3F3B;` +
      `font:600 10px/1.4 system-ui;padding:2px 6px;border-radius:3px;white-space:nowrap;pointer-events:none;` +
      `box-shadow:0 1px 4px rgba(0,0,0,0.12);`;
    d.textContent = fmtDist(dist);
    el.appendChild(d);
  }

  // Area + perimeter label at polygon centroid
  const cLat = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const cLng = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  const cPx  = map.latLngToContainerPoint([cLat, cLng] as LatLng);

  // Check pixel bounding box to decide if label fits inside
  const pxs = positions.map(p => map.latLngToContainerPoint(p));
  const minX = Math.min(...pxs.map(p => p.x)), maxX = Math.max(...pxs.map(p => p.x));
  const minY = Math.min(...pxs.map(p => p.y)), maxY = Math.max(...pxs.map(p => p.y));
  const fitsInside = (maxX - minX) > 90 && (maxY - minY) > 40;

  const d = document.createElement("div");
  d.style.cssText =
    `position:absolute;left:${cPx.x}px;top:${fitsInside ? cPx.y : minY - 14}px;transform:translate(-50%,-50%);` +
    `background:rgba(48,98,35,0.88);color:#fff;` +
    `font:700 12px/1.5 system-ui;padding:5px 10px;border-radius:7px;white-space:nowrap;` +
    `pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.22);text-align:center;z-index:2;`;
  d.innerHTML =
    `<div>${fmtArea(measurements.area)}</div>` +
    `<div style="font-size:10px;font-weight:500;opacity:0.85;margin-top:1px">${fmtDist(measurements.perimeter)}</div>`;
  el.appendChild(d);
}

const TOOLS: { id: Exclude<Mode, null>; Icon: typeof Square; label: string }[] = [
  { id: "rect", Icon: Square,  label: "Rectangle — drag to draw" },
  { id: "poly", Icon: PenTool, label: "Polygon — click points, click first point or double-click to close" },
];

interface DrawToolsProps {
  onShapeCommitted?: (lat: number, lng: number) => void;
  onClear?: () => void;
  hasSiteCircle?: boolean;
}

function centroid(s: DraftShape): [number, number] {
  if (s.kind === "rect") {
    return [(s.bounds[0][0] + s.bounds[1][0]) / 2, (s.bounds[0][1] + s.bounds[1][1]) / 2];
  }
  if (s.kind === "poly") {
    const n = s.positions.length;
    const lat = s.positions.reduce((sum, p) => sum + p[0], 0) / n;
    const lng = s.positions.reduce((sum, p) => sum + p[1], 0) / n;
    return [lat, lng];
  }
  return [s.center[0], s.center[1]];
}

function rectRing(b: [LatLng, LatLng]): LatLng[] {
  const [a, c] = b;
  return [[a[0], a[1]], [a[0], c[1]], [c[0], c[1]], [c[0], a[1]]];
}

export function DrawTools({ onShapeCommitted, onClear, hasSiteCircle }: DrawToolsProps = {}) {
  const map = useMap();
  const {
    setRectBounds, setMode: setDrawMode, setBoundary, setSiteMeasurements,
    showDimensions, boundary, siteMeasurements,
  } = useDrawStore();
  const [mode, setMode]     = useState<Mode>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const idRef = useRef(1);

  // Expose the active tool to MapClickHandler (suppresses marker placement).
  useEffect(() => { setDrawMode(mode); }, [mode, setDrawMode]);

  const [draftRect, setDraftRect]     = useState<[LatLng, LatLng] | null>(null);
  const [draftCircle, setDraftCircle] = useState<{ center: LatLng; radius: number } | null>(null);
  const dragStart = useRef<LatLng | null>(null);

  const [polyPts, setPolyPts] = useState<LatLng[]>([]);
  const [cursor, setCursor]   = useState<LatLng | null>(null);
  // Latest poly points for event handlers — lets commit() run from the handler
  // (not inside a setState updater, which would setState during render).
  const polyPtsRef = useRef<LatLng[]>([]);
  useEffect(() => { polyPtsRef.current = polyPts; }, [polyPts]);

  const barRef           = useRef<HTMLDivElement | null>(null);
  const measureElRef     = useRef<HTMLDivElement | null>(null);
  const staticMeasureElRef = useRef<HTMLDivElement | null>(null);
  const cursorRef        = useRef<LatLng | null>(null);

  // Create/destroy live measurement overlay container
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:1050;";
    map.getContainer().appendChild(el);
    measureElRef.current = el;
    return () => { el.remove(); measureElRef.current = null; };
  }, [map]);

  // Create/destroy static measurement overlay container (committed boundary)
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:1040;";
    map.getContainer().appendChild(el);
    staticMeasureElRef.current = el;
    return () => { el.remove(); staticMeasureElRef.current = null; };
  }, [map]);

  // Re-render static labels when boundary/measurements/showDimensions/mode changes
  useEffect(() => {
    // Hide static labels while actively drawing to avoid overlap with live labels
    const pos = (mode === null && boundary) ? boundary.positions as LatLng[] : null;
    renderStaticMeasure(pos, siteMeasurements, map, staticMeasureElRef.current, showDimensions);
  }, [boundary, siteMeasurements, showDimensions, mode, map]);

  // Re-render static labels on map pan/zoom
  useEffect(() => {
    const el = staticMeasureElRef.current;
    const redraw = () => {
      const pos = (mode === null && boundary) ? boundary.positions as LatLng[] : null;
      renderStaticMeasure(pos, siteMeasurements, map, el, showDimensions);
    };
    // Leaflet CSS-scales .leaflet-map-pane during zoom animation; our labels sit outside
    // that pane so they freeze at stale pixel positions mid-animation. Hide while animating,
    // redraw at final positions once zoomend fires.
    const hide = () => { if (el) el.style.visibility = "hidden"; };
    const show = () => { redraw(); if (el) el.style.visibility = ""; };
    map.on("move", redraw);
    map.on("zoomstart", hide);
    map.on("zoomend", show);
    return () => {
      map.off("move", redraw);
      map.off("zoomstart", hide);
      map.off("zoomend", show);
    };
  }, [boundary, siteMeasurements, showDimensions, mode, map]);

  // Re-render measurement labels when map pans / zooms
  useEffect(() => {
    if (mode !== "poly") return;
    const el = measureElRef.current;
    const redraw = () => {
      if (showDimensions) renderMeasure(polyPtsRef.current, cursorRef.current, map, el);
      else if (el) el.innerHTML = "";
    };
    const hide = () => { if (el) el.style.visibility = "hidden"; };
    const show = () => { redraw(); if (el) el.style.visibility = ""; };
    map.on("move", redraw);
    map.on("zoomstart", hide);
    map.on("zoomend", show);
    return () => {
      map.off("move", redraw);
      map.off("zoomstart", hide);
      map.off("zoomend", show);
    };
  }, [mode, map, showDimensions]);

  // Clear measurements when leaving poly mode
  useEffect(() => {
    if (mode !== "poly" && measureElRef.current) measureElRef.current.innerHTML = "";
  }, [mode]);

  const commit = useCallback((s: DraftShape) => {
    setShapes((prev) => [...prev, { ...s, id: idRef.current++ }]);
    if (s.kind === "rect") {
      const ring = rectRing(s.bounds);
      setRectBounds(s.bounds);
      setBoundary({ kind: "rect", positions: ring });
      setSiteMeasurements({
        area: polyAreaM2(ring),
        perimeter: polyPerimM(ring, map),
        angles: [90, 90, 90, 90],
      });
    } else if (s.kind === "poly") {
      setBoundary({ kind: "poly", positions: s.positions });
      const pts = s.positions;
      setSiteMeasurements({
        area: polyAreaM2(pts),
        perimeter: polyPerimM(pts, map),
        angles: pts.map((_, i) => {
          const prev = pts[(i - 1 + pts.length) % pts.length];
          const next = pts[(i + 1) % pts.length];
          return interiorAngle(prev, pts[i], next);
        }),
      });
    }
    const [lat, lng] = centroid(s);
    onShapeCommitted?.(lat, lng);
    // Exit drawing mode immediately so static dimension labels render right away.
    setMode(null);
  }, [map, setRectBounds, setBoundary, setSiteMeasurements, onShapeCommitted, setMode]);

  // Stop map drag/zoom from triggering beneath the toolbar.
  // disableClickPropagation also kills `click`, which breaks React's
  // delegated onClick handlers — so stop only mousedown/dblclick/scroll.
  useEffect(() => {
    if (!barRef.current) return;
    const el = barRef.current;
    L.DomEvent.disableScrollPropagation(el);
    L.DomEvent.on(el, "mousedown dblclick touchstart pointerdown", L.DomEvent.stopPropagation);
    return () => {
      L.DomEvent.off(el, "mousedown dblclick touchstart pointerdown", L.DomEvent.stopPropagation);
    };
  }, []);

  // ── Rectangle / Circle: press-drag-release ──────────────────────────────
  useEffect(() => {
    if (mode !== "rect" && mode !== "circle") return;
    map.dragging.disable();
    const el = map.getContainer();
    el.style.cursor = "crosshair";

    const down = (e: L.LeafletMouseEvent) => { dragStart.current = [e.latlng.lat, e.latlng.lng]; };
    const move = (e: L.LeafletMouseEvent) => {
      if (!dragStart.current) return;
      const cur: LatLng = [e.latlng.lat, e.latlng.lng];
      if (mode === "rect") setDraftRect([dragStart.current, cur]);
      else setDraftCircle({ center: dragStart.current, radius: map.distance(dragStart.current, cur) });
    };
    const up = (e: L.LeafletMouseEvent) => {
      if (!dragStart.current) return;
      const cur: LatLng = [e.latlng.lat, e.latlng.lng];
      if (mode === "rect") {
        if (dragStart.current[0] !== cur[0] || dragStart.current[1] !== cur[1]) {
          commit({ kind: "rect", bounds: [dragStart.current, cur] });
        }
        setDraftRect(null);
      } else {
        const r = map.distance(dragStart.current, cur);
        if (r > 1) commit({ kind: "circle", center: dragStart.current, radius: r });
        setDraftCircle(null);
      }
      dragStart.current = null;
    };

    map.on("mousedown", down);
    map.on("mousemove", move);
    map.on("mouseup", up);
    return () => {
      map.off("mousedown", down);
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      el.style.cursor = "";
      dragStart.current = null;
      setDraftRect(null);
      setDraftCircle(null);
    };
  }, [mode, map, commit]);

  // ── Polygon: click points, close on first-point click or double-click ────
  useEffect(() => {
    if (mode !== "poly") return;
    const el = map.getContainer();
    el.style.cursor = "crosshair";
    map.doubleClickZoom.disable();

    const click = (e: L.LeafletMouseEvent) => {
      const prev = polyPtsRef.current;
      if (prev.length >= 3) {
        const first = map.latLngToContainerPoint(prev[0]);
        const here  = map.latLngToContainerPoint(e.latlng);
        if (first.distanceTo(here) < 14) {
          commit({ kind: "poly", positions: prev });
          polyPtsRef.current = [];
          cursorRef.current = null;
          setPolyPts([]);
          setCursor(null);
          if (measureElRef.current) measureElRef.current.innerHTML = "";
          return;
        }
      }
      const next: LatLng[] = [...prev, [e.latlng.lat, e.latlng.lng]];
      polyPtsRef.current = next;
      setPolyPts(next);
      if (showDimensions) renderMeasure(next, cursorRef.current, map, measureElRef.current);
    };
    const move = (e: L.LeafletMouseEvent) => {
      const cur: LatLng = [e.latlng.lat, e.latlng.lng];
      cursorRef.current = cur;
      setCursor(cur);
      if (showDimensions) renderMeasure(polyPtsRef.current, cur, map, measureElRef.current);
      else if (measureElRef.current) measureElRef.current.innerHTML = "";
    };
    const dbl = () => {
      const prev = polyPtsRef.current;
      if (prev.length >= 3) commit({ kind: "poly", positions: prev });
      polyPtsRef.current = [];
      cursorRef.current = null;
      setPolyPts([]);
      setCursor(null);
      if (measureElRef.current) measureElRef.current.innerHTML = "";
    };

    map.on("click", click);
    map.on("mousemove", move);
    map.on("dblclick", dbl);
    return () => {
      map.off("click", click);
      map.off("mousemove", move);
      map.off("dblclick", dbl);
      map.doubleClickZoom.enable();
      el.style.cursor = "";
      cursorRef.current = null;
      setPolyPts([]);
      setCursor(null);
      if (measureElRef.current) measureElRef.current.innerHTML = "";
    };
  }, [mode, map, commit, showDimensions]);

  function selectTool(id: Exclude<Mode, null>) {
    setMode((m) => (m === id ? null : id));
  }
  function clearAll() {
    setShapes([]);
    setPolyPts([]);
    setCursor(null);
    setDraftRect(null);
    setDraftCircle(null);
    dragStart.current = null;
    cursorRef.current = null;
    setRectBounds(null);
    setBoundary(null);
    setSiteMeasurements(null);
    if (measureElRef.current)       measureElRef.current.innerHTML = "";
    if (staticMeasureElRef.current) staticMeasureElRef.current.innerHTML = "";
    onClear?.();
  }

  const hasDrawing =
    shapes.length > 0 || polyPts.length > 0 || draftRect !== null || draftCircle !== null || !!hasSiteCircle;

  const btnBase: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 9, border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", color: "#3A3F3B", transition: "background 0.12s, color 0.12s",
    flexShrink: 0,
  };
  const activeStyle: React.CSSProperties = {
    background: "#306223", color: "#FDFCFB",
    boxShadow: "0 2px 8px rgba(48,98,35,0.30)",
  };

  const MODE_HINT: Record<string, string> = {
    rect: "Drag to draw a rectangle",
    poly: "Click to place points · double-click or close to finish",
  };

  const toolbar = (
    <div
      ref={barRef}
      style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        pointerEvents: "none",
      }}
      role="toolbar"
      aria-label="Map drawing tools"
    >
      {/* Mode hint pill — appears above toolbar when a drawing tool is active */}
      {mode && (
        <div style={{
          background: "rgba(253,252,251,0.72)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 20, padding: "4px 12px",
          fontSize: 11, fontWeight: 600, color: "#306223",
          boxShadow: "0 2px 10px rgba(58,63,59,0.14)",
          whiteSpace: "nowrap", pointerEvents: "none",
          fontFamily: "system-ui, sans-serif",
        }}>
          {MODE_HINT[mode] ?? mode}
        </div>
      )}

      {/* Button row */}
      <div style={{
        background: "rgba(253,252,251,0.62)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.65)",
        borderRadius: 14, padding: 6,
        display: "flex", flexDirection: "row", gap: 2,
        boxShadow: "0 8px 30px rgba(58,63,59,0.22), inset 0 1px 0 rgba(255,255,255,0.55)",
        pointerEvents: "all",
      }}>
        {/* Pan / deselect */}
        <button
          title="Pan / select"
          onClick={() => setMode(null)}
          style={{ ...btnBase, ...(mode === null ? activeStyle : {}) }}
          onMouseEnter={(e) => { if (mode !== null) { e.currentTarget.style.background = "#F2EDE8"; e.currentTarget.style.color = "#306223"; } }}
          onMouseLeave={(e) => { if (mode !== null) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#3A3F3B"; } }}
        >
          <MousePointer2 size={17} aria-hidden />
        </button>

        <div style={{ width: 1, height: 22, background: "rgba(207,214,196,0.6)", margin: "4px 2px", alignSelf: "center" }} />

        {TOOLS.map(({ id, Icon, label }) => {
          const on = mode === id;
          return (
            <button
              key={id}
              title={label}
              onClick={() => selectTool(id)}
              style={{ ...btnBase, ...(on ? activeStyle : {}) }}
              onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = "#F2EDE8"; e.currentTarget.style.color = "#306223"; } }}
              onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#3A3F3B"; } }}
            >
              <Icon size={17} aria-hidden />
            </button>
          );
        })}

        <div style={{ width: 1, height: 22, background: "rgba(207,214,196,0.6)", margin: "4px 2px", alignSelf: "center" }} />

        {/* Clear */}
        <button
          title="Clear all drawings"
          onClick={clearAll}
          disabled={!hasDrawing}
          style={{ ...btnBase, color: hasDrawing ? "#C46A6A" : "#B8C4BB", cursor: hasDrawing ? "pointer" : "default" }}
          onMouseEnter={(e) => { if (hasDrawing) { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#b91c1c"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasDrawing ? "#C46A6A" : "#B8C4BB"; }}
        >
          <Trash2 size={17} aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(toolbar, map.getContainer())}

      {/* Committed shapes */}
      {shapes.map((s) =>
        s.kind === "rect" ? (
          <Rectangle key={s.id} bounds={s.bounds} pathOptions={PATH} />
        ) : s.kind === "circle" ? (
          <Circle key={s.id} center={s.center} radius={s.radius} pathOptions={PATH} />
        ) : (
          <Polygon key={s.id} positions={s.positions} pathOptions={PATH} />
        ),
      )}

      {/* Live drafts */}
      {draftRect && <Rectangle bounds={draftRect} pathOptions={DRAFT} />}
      {draftCircle && <Circle center={draftCircle.center} radius={draftCircle.radius} pathOptions={DRAFT} />}

      {/* Polygon in progress */}
      {polyPts.length > 0 && (
        <>
          <Polyline positions={cursor ? [...polyPts, cursor] : polyPts} pathOptions={DRAFT} />
          {polyPts.map((p, i) => (
            <CircleMarker
              key={i}
              center={p}
              radius={i === 0 ? 5 : 3}
              pathOptions={{ color: STROKE, weight: 2, fillColor: "#FDFCFB", fillOpacity: 1 }}
            />
          ))}
        </>
      )}
    </>
  );
}
