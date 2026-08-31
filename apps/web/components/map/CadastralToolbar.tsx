// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchDistricts, fetchTaluks, fetchHoblis, fetchVillages,
  fetchParcelData, searchBySurveyNo,
  type HierarchyItem, type SurveySearchResult,
} from "@/lib/api/cadastral_records";

interface Props {
  onLoad: (fc: GeoJSON.FeatureCollection | null, label: string) => void;
  onSurveySelect?: (result: SurveySearchResult) => void;
  selectedVillageName?: string;
  selectedSurveyNo?: string;
}

const SEL_STYLE: React.CSSProperties = {
  padding: "3px 6px", border: "1px solid #CFD6C4", borderRadius: 5,
  fontSize: 12, background: "#FDFCFB", cursor: "pointer",
  color: "#3A3F3B", fontFamily: "inherit",
};
const BTN_STYLE: React.CSSProperties = {
  padding: "4px 14px", background: "#306223", color: "#FDFCFB",
  border: "none", borderRadius: 5, fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em",
};
const INPUT_STYLE: React.CSSProperties = {
  padding: "3px 8px", border: "1px solid #CFD6C4", borderRadius: 5,
  fontSize: 12, width: 150, background: "#FDFCFB",
  color: "#3A3F3B", fontFamily: "inherit",
};

export function CadastralToolbar({ onLoad, onSurveySelect, selectedVillageName, selectedSurveyNo }: Props) {
  const [districts, setDistricts] = useState<HierarchyItem[]>([]);
  const [taluks, setTaluks]       = useState<HierarchyItem[]>([]);
  const [hoblis, setHoblis]       = useState<HierarchyItem[]>([]);
  const [villages, setVillages]   = useState<HierarchyItem[]>([]);

  const [dist, setDist]   = useState("");
  const [taluk, setTaluk] = useState("");
  const [hobli, setHobli] = useState("");
  const [vlg, setVlg]     = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState("");

  const [surveyQ, setSurveyQ]         = useState("");
  const [surveyResults, setSurveyResults] = useState<SurveySearchResult[]>([]);
  const [showSurveyDrop, setShowSurveyDrop] = useState(false);
  const surveyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchDistricts().then(setDistricts);
  }, []);

  function handleDistChange(v: string) {
    setDist(v); setTaluk(""); setHobli(""); setVlg("");
    setTaluks([]); setHoblis([]); setVillages([]);
    if (v) fetchTaluks(v).then(setTaluks);
  }
  function handleTalukChange(v: string) {
    setTaluk(v); setHobli(""); setVlg("");
    setHoblis([]); setVillages([]);
    if (dist && v) fetchHoblis(dist, v).then(setHoblis);
  }
  function handleHobliChange(v: string) {
    setHobli(v); setVlg(""); setVillages([]);
    if (dist && taluk && v) fetchVillages(dist, taluk, v).then(setVillages);
  }

  async function handleLoad() {
    if (!dist) { setStatus("Select a district first"); return; }
    setLoading(true);
    setStatus("Loading…");
    const fc = await fetchParcelData(dist, taluk, hobli, vlg);
    setLoading(false);
    if (!fc) { setStatus("No parcel data"); onLoad(null, ""); return; }
    const n = fc.features?.length ?? 0;
    const label = n > 500
      ? `${n} parcel(s) loaded (labels hidden above 500 — click a parcel to see its survey no.)`
      : `${n} parcel(s) loaded`;
    setStatus(label);
    onLoad(fc, label);
  }

  function handleSurveyInput(v: string) {
    setSurveyQ(v);
    if (surveyTimer.current) clearTimeout(surveyTimer.current);
    if (v.length < 2) { setSurveyResults([]); setShowSurveyDrop(false); return; }
    surveyTimer.current = setTimeout(async () => {
      const results = await searchBySurveyNo(v);
      setSurveyResults(results);
      setShowSurveyDrop(results.length > 0);
    }, 300);
  }

  function handleSurveyPick(r: SurveySearchResult) {
    setSurveyQ(r.survey_no);
    setShowSurveyDrop(false);
    onSurveySelect?.(r);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
      background: "rgba(253,252,251,0.55)",
      backdropFilter: "blur(14px) saturate(160%)",
      WebkitBackdropFilter: "blur(14px) saturate(160%)",
      borderBottom: "1px solid rgba(255,255,255,0.6)",
      flexWrap: "wrap", minHeight: 42,
      boxShadow: "0 6px 26px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
    }}>
      <span style={{ color: "#306223", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
        Karnataka Cadastral
      </span>
      <span style={{ color: "#CFD6C4", fontSize: 16 }}>|</span>

      {/* District */}
      <select value={dist} onChange={(e) => handleDistChange(e.target.value)} style={SEL_STYLE}>
        <option value="">District</option>
        {districts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
      </select>

      {/* Taluk */}
      <select value={taluk} onChange={(e) => handleTalukChange(e.target.value)} style={{ ...SEL_STYLE, opacity: taluks.length ? 1 : 0.45 }}>
        <option value="">{taluks.length ? "Taluk" : dist ? "Loading…" : "— Taluk —"}</option>
        {taluks.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
      </select>

      {/* Hobli */}
      <select value={hobli} onChange={(e) => handleHobliChange(e.target.value)} style={{ ...SEL_STYLE, opacity: hoblis.length ? 1 : 0.45 }}>
        <option value="">{hoblis.length ? "Hobli" : taluk ? "Loading…" : "— Hobli —"}</option>
        {hoblis.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
      </select>

      {/* Village */}
      <select value={vlg} onChange={(e) => setVlg(e.target.value)} style={{ ...SEL_STYLE, opacity: villages.length ? 1 : 0.45 }}>
        <option value="">{villages.length ? "All villages" : hobli ? "Loading…" : "— Village —"}</option>
        {villages.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
      </select>

      <button onClick={handleLoad} disabled={loading} style={BTN_STYLE}>
        {loading ? "Loading…" : "Load"}
      </button>

      {/* Survey search */}
      <div style={{ position: "relative" }}>
        <input
          value={surveyQ}
          onChange={(e) => handleSurveyInput(e.target.value)}
          placeholder="🔍 Survey No."
          style={INPUT_STYLE}
          onBlur={() => setTimeout(() => setShowSurveyDrop(false), 200)}
        />
        {showSurveyDrop && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            background: "rgba(253,252,251,0.55)",
            backdropFilter: "blur(14px) saturate(160%)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.6)",
            borderRadius: 12, zIndex: 2000,
            maxHeight: 260, overflowY: "auto", width: 360,
            boxShadow: "0 8px 28px rgba(58,63,59,0.20)",
          }}>
            {(() => {
              const q = surveyQ.toLowerCase();
              const showPin = !!(selectedSurveyNo && selectedVillageName);
              const pinnedAlreadyInResults = surveyResults.some(
                (r) => r.survey_no === selectedSurveyNo && r.village_name === selectedVillageName,
              );
              const others = surveyResults.filter(
                (r) => !(r.survey_no === selectedSurveyNo && r.village_name === selectedVillageName),
              );
              const ROW = (r: SurveySearchResult, i: number) => (
                <div
                  key={i}
                  onMouseDown={() => handleSurveyPick(r)}
                  style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid rgba(207,214,196,0.45)", color: "#3A3F3B" }}
                >
                  <b>{r.survey_no}</b>
                  <span style={{ color: "#7B8F83", marginLeft: 4 }}>— {r.village_name} (dist {r.dist} taluk {r.taluk})</span>
                </div>
              );
              return (
                <>
                  {showPin && !pinnedAlreadyInResults && (
                    <>
                      <div style={{ padding: "3px 10px", fontSize: 9.5, fontWeight: 700, color: "#166534", background: "rgba(240,253,244,0.7)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Loaded selection
                      </div>
                      <div
                        onMouseDown={() => onSurveySelect?.({ survey_no: selectedSurveyNo!, village_name: selectedVillageName!, dist: "", taluk: "", hobli: "", vlg: "" })}
                        style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid rgba(207,214,196,0.45)", color: "#3A3F3B", background: "rgba(240,253,244,0.7)" }}
                      >
                        <b>{selectedSurveyNo}</b>
                        <span style={{ fontSize: 9.5, fontWeight: 700, marginLeft: 6, padding: "1px 5px", borderRadius: 3, background: "#166534", color: "#fff" }}>current</span>
                        <span style={{ color: "#7B8F83", marginLeft: 4 }}>— {selectedVillageName}</span>
                      </div>
                      {others.length > 0 && <div style={{ padding: "3px 10px", fontSize: 9.5, fontWeight: 700, color: "#7B8F83", background: "rgba(248,246,242,0.7)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Other matches</div>}
                    </>
                  )}
                  {showPin && pinnedAlreadyInResults && (
                    <>
                      <div style={{ padding: "3px 10px", fontSize: 9.5, fontWeight: 700, color: "#166534", background: "rgba(240,253,244,0.7)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Loaded selection
                      </div>
                      <div
                        onMouseDown={() => {
                          const r = surveyResults.find((x) => x.survey_no === selectedSurveyNo && x.village_name === selectedVillageName);
                          if (r) handleSurveyPick(r);
                        }}
                        style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid rgba(207,214,196,0.45)", color: "#3A3F3B", background: "rgba(240,253,244,0.7)" }}
                      >
                        <b>{selectedSurveyNo}</b>
                        <span style={{ fontSize: 9.5, fontWeight: 700, marginLeft: 6, padding: "1px 5px", borderRadius: 3, background: "#166534", color: "#fff" }}>current</span>
                        <span style={{ color: "#7B8F83", marginLeft: 4 }}>— {selectedVillageName}</span>
                      </div>
                      {others.length > 0 && <div style={{ padding: "3px 10px", fontSize: 9.5, fontWeight: 700, color: "#7B8F83", background: "rgba(248,246,242,0.7)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Other matches</div>}
                    </>
                  )}
                  {others.map((r, i) => ROW(r, i))}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Status */}
      {status && (
        <span style={{ fontSize: 12, color: "#7B8F83", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {status}
        </span>
      )}
    </div>
  );
}
