"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Search, Loader2, MapPin } from "lucide-react";

// Match "lat, lng" / "lat lng" with optional sign + decimals
const LATLNG = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

interface Suggestion { name: string; lat: number; lon: number }

export function MapSearch({ topOffset = 72 }: { topOffset?: number }) {
  const map = useMap();
  const [query, setQuery]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [results, setResults]   = useState<Suggestion[]>([]);
  const [active, setActive]     = useState(-1);
  const boxRef   = useRef<HTMLFormElement | null>(null);
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep clicks/scroll/keys off the map beneath the bar
  useEffect(() => {
    if (boxRef.current) {
      L.DomEvent.disableClickPropagation(boxRef.current);
      L.DomEvent.disableScrollPropagation(boxRef.current);
    }
  }, []);

  function flyTo(lat: number, lon: number) {
    map.flyTo([lat, lon], 16, { duration: 0.9 });
  }

  async function fetchSuggestions(q: string) {
    if (LATLNG.test(q) || q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      const data: { lat: string; lon: string; display_name: string }[] = await res.json();
      setResults(data.map((d) => ({ name: d.display_name, lat: parseFloat(d.lat), lon: parseFloat(d.lon) })));
      setActive(-1);
    } catch {
      /* network hiccup — leave prior results */
    } finally {
      setLoading(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (error) setError("");
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => fetchSuggestions(v), 320);
  }

  function pick(s: Suggestion) {
    flyTo(s.lat, s.lon);
    setQuery(s.name.split(",")[0]);
    setResults([]);
    setActive(-1);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // explicit coords
    const m = q.match(LATLNG);
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) { flyTo(lat, lng); setResults([]); return; }
      setError("Coordinates out of range");
      return;
    }
    // an active/first suggestion already loaded
    if (results.length) { pick(results[active >= 0 ? active : 0]); return; }
    // otherwise geocode the typed text
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      const data: { lat: string; lon: string }[] = await res.json();
      if (!data.length) { setError("Place not found"); return; }
      flyTo(parseFloat(data[0].lat), parseFloat(data[0].lon));
    } catch {
      setError("Search failed — try again");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") { setResults([]); setActive(-1); }
  }

  const glass: React.CSSProperties = {
    background: "rgba(253,252,251,0.55)",
    backdropFilter: "blur(14px) saturate(160%)",
    WebkitBackdropFilter: "blur(14px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.6)",
  };

  const bar = (
    <form
      ref={boxRef}
      onSubmit={submit}
      style={{
        position: "absolute", top: topOffset, left: "50%", transform: "translateX(-50%)",
        zIndex: 1000, width: "min(440px, calc(100% - 120px))",
        display: "flex", flexDirection: "column", gap: 6, pointerEvents: "auto",
      }}
      role="search"
      aria-label="Search location"
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", borderRadius: 999, ...glass,
        boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
      }}>
        {loading
          ? <Loader2 size={16} color="#657166" className="animate-spin" aria-hidden />
          : <Search size={16} color="#657166" aria-hidden />}
        <input
          className="map-search-input"
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Search a place or enter lat, long"
          aria-label="Search a place or enter latitude, longitude"
          autoComplete="off"
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            fontSize: 13, color: "#3A3F3B", fontFamily: "inherit",
          }}
        />
        <button
          type="submit" aria-label="Go to location"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 999, border: "none", flexShrink: 0,
            background: "#657166", color: "#FDFCFB", cursor: "pointer",
          }}
        >
          <MapPin size={14} aria-hidden />
        </button>
      </div>

      {/* Suggestions dropdown */}
      {results.length > 0 && (
        <div style={{
          ...glass, borderRadius: 12, overflow: "hidden",
          boxShadow: "0 8px 28px rgba(58,63,59,0.20)", maxHeight: 240, overflowY: "auto",
        }}>
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lon},${i}`}
              type="button"
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, width: "100%",
                textAlign: "left", padding: "8px 12px", border: "none", cursor: "pointer",
                background: i === active ? "rgba(101,113,102,0.14)" : "transparent",
                fontFamily: "inherit",
                borderTop: i === 0 ? "none" : "1px solid rgba(207,214,196,0.5)",
              }}
            >
              <MapPin size={13} color="#657166" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
              <span style={{ fontSize: 12, color: "#3A3F3B", lineHeight: 1.35 }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          alignSelf: "center", fontSize: 11, fontWeight: 500, color: "#C46A6A",
          ...glass, borderRadius: 8, padding: "3px 10px",
        }}>
          {error}
        </div>
      )}
    </form>
  );

  return createPortal(bar, map.getContainer());
}
