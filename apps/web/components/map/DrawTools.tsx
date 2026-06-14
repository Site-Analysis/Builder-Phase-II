"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMap, Rectangle, Circle, Polygon, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Square, Circle as CircleIcon, PenTool, Trash2, MousePointer2 } from "lucide-react";

type LatLng = [number, number];
type Mode = "rect" | "circle" | "poly" | null;

type DraftShape =
  | { kind: "rect"; bounds: [LatLng, LatLng] }
  | { kind: "circle"; center: LatLng; radius: number }
  | { kind: "poly"; positions: LatLng[] };
type Shape = DraftShape & { id: number };

const STROKE = "#657166";       // brand primary
const FILL   = "#99CDD8";       // brand secondary
const PATH   = { color: STROKE, weight: 2, fillColor: FILL, fillOpacity: 0.18 } as const;
const DRAFT  = { color: STROKE, weight: 2, dashArray: "6 5", fillColor: FILL, fillOpacity: 0.10 } as const;

const TOOLS: { id: Exclude<Mode, null>; Icon: typeof Square; label: string }[] = [
  { id: "rect",   Icon: Square,     label: "Rectangle — drag to draw" },
  { id: "poly",   Icon: PenTool,    label: "Polygon — click points, click first point or double-click to close" },
  { id: "circle", Icon: CircleIcon, label: "Circle — drag to draw" },
];

export function DrawTools() {
  const map = useMap();
  const [mode, setMode]     = useState<Mode>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const idRef = useRef(1);

  const [draftRect, setDraftRect]     = useState<[LatLng, LatLng] | null>(null);
  const [draftCircle, setDraftCircle] = useState<{ center: LatLng; radius: number } | null>(null);
  const dragStart = useRef<LatLng | null>(null);

  const [polyPts, setPolyPts] = useState<LatLng[]>([]);
  const [cursor, setCursor]   = useState<LatLng | null>(null);

  const barRef = useRef<HTMLDivElement | null>(null);

  const commit = useCallback((s: DraftShape) => {
    setShapes((prev) => [...prev, { ...s, id: idRef.current++ }]);
  }, []);

  // Stop the toolbar from triggering map drag/zoom/draw beneath it
  useEffect(() => {
    if (barRef.current) {
      L.DomEvent.disableClickPropagation(barRef.current);
      L.DomEvent.disableScrollPropagation(barRef.current);
    }
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
      const p: LatLng = [e.latlng.lat, e.latlng.lng];
      setPolyPts((prev) => {
        if (prev.length >= 3) {
          const first = map.latLngToContainerPoint(prev[0]);
          const here  = map.latLngToContainerPoint(e.latlng);
          if (first.distanceTo(here) < 14) {
            commit({ kind: "poly", positions: prev });
            setCursor(null);
            return [];
          }
        }
        return [...prev, p];
      });
    };
    const move = (e: L.LeafletMouseEvent) => setCursor([e.latlng.lat, e.latlng.lng]);
    const dbl = () => {
      setPolyPts((prev) => {
        if (prev.length >= 3) commit({ kind: "poly", positions: prev });
        setCursor(null);
        return [];
      });
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
      setPolyPts([]);
      setCursor(null);
    };
  }, [mode, map, commit]);

  function selectTool(id: Exclude<Mode, null>) {
    setMode((m) => (m === id ? null : id));
  }
  function clearAll() {
    setShapes([]);
    setPolyPts([]);
    setCursor(null);
  }

  const btnBase: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", color: "#7B8F83", transition: "background 0.12s, color 0.12s",
  };
  const activeStyle: React.CSSProperties = { background: "#657166", color: "#FDFCFB" };

  const toolbar = (
    <div
      ref={barRef}
      style={{
        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
        zIndex: 1000, background: "rgba(253,252,251,0.97)",
        border: "1px solid #CFD6C4", borderRadius: 12, padding: 5,
        display: "flex", flexDirection: "column", gap: 3,
        boxShadow: "0 4px 18px rgba(0,0,0,0.12)",
      }}
      role="toolbar"
      aria-label="Map drawing tools"
    >
      {/* Pan / deselect */}
      <button
        title="Pan / select"
        onClick={() => setMode(null)}
        style={{ ...btnBase, ...(mode === null ? activeStyle : {}) }}
        onMouseEnter={(e) => { if (mode !== null) e.currentTarget.style.background = "#F2EDE8"; }}
        onMouseLeave={(e) => { if (mode !== null) e.currentTarget.style.background = "transparent"; }}
      >
        <MousePointer2 size={16} aria-hidden />
      </button>

      <div style={{ height: 1, background: "#CFD6C4", margin: "1px 4px" }} />

      {TOOLS.map(({ id, Icon, label }) => {
        const on = mode === id;
        return (
          <button
            key={id}
            title={label}
            onClick={() => selectTool(id)}
            style={{ ...btnBase, ...(on ? activeStyle : {}) }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "#F2EDE8"; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
          >
            <Icon size={16} aria-hidden />
          </button>
        );
      })}

      <div style={{ height: 1, background: "#CFD6C4", margin: "1px 4px" }} />

      {/* Clear */}
      <button
        title="Clear all drawings"
        onClick={clearAll}
        disabled={shapes.length === 0}
        style={{ ...btnBase, color: shapes.length ? "#C46A6A" : "#B8C4BB", cursor: shapes.length ? "pointer" : "default" }}
        onMouseEnter={(e) => { if (shapes.length) e.currentTarget.style.background = "#F5E4E4"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Trash2 size={16} aria-hidden />
      </button>
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
