"use client";

import { useState, useEffect } from "react";
import type { ModuleResult } from "@/lib/stores/analysis";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { getLandRecordsAnalysis } from "@/lib/api/analysis";
import { ExternalLink, Info } from "lucide-react";

interface LandPrefill {
  district?: string;
  taluk?: string;
  hobli?: string;
  village?: string;
  surveyNumber?: string;
}

interface LandRecordsPanelProps {
  result?: ModuleResult;
  prefill?: LandPrefill;     // authoritative KGIS rural context (survey number etc.)
}

interface DeepLink {
  label: string;
  url: string;
  description: string;
}

interface LandPayload {
  deep_links?: DeepLink[];
  notes?: string;
}

const FIELD_STYLE: React.CSSProperties = {
  width: "100%", padding: "6px 8px", fontSize: 12,
  border: "1px solid #CFD6C4", borderRadius: 6,
  background: "#FDFCFB", color: "#3A3F3B",
  fontFamily: "inherit", outline: "none",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, color: "#7B8F83", fontWeight: 600,
  display: "block", marginBottom: 3,
};

export function LandRecordsPanel({ result, prefill }: LandRecordsPanelProps) {
  const { setModuleLoading, setModuleResult, setModuleError } = useAnalysisStore();

  const [district,     setDistrict]     = useState("Bengaluru Urban");
  const [taluk,        setTaluk]        = useState("");
  const [hobli,        setHobli]        = useState("");
  const [village,      setVillage]      = useState("");
  const [surveyNumber, setSurveyNumber] = useState("");

  // Authoritative KGIS rural context auto-fills empty fields (never clobbers edits).
  useEffect(() => {
    if (!prefill) return;
    if (prefill.district) setDistrict((v) => (v && v !== "Bengaluru Urban" ? v : prefill.district!));
    if (prefill.taluk)        setTaluk((v) => v || prefill.taluk!);
    if (prefill.hobli)        setHobli((v) => v || prefill.hobli!);
    if (prefill.village)      setVillage((v) => v || prefill.village!);
    if (prefill.surveyNumber) setSurveyNumber((v) => v || prefill.surveyNumber!);
  }, [prefill?.district, prefill?.taluk, prefill?.hobli, prefill?.village, prefill?.surveyNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = result?.qualitative?.find((q) => q.label === "__land_payload__")?.value;
  const payload: LandPayload | null = raw ? JSON.parse(raw) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!district || !taluk || !hobli || !village || !surveyNumber) return;
    setModuleLoading("land");
    try {
      const data = await getLandRecordsAnalysis(district, taluk, hobli, village, surveyNumber) as LandPayload;
      setModuleResult("land", {
        score: 50,
        severity: "none",
        summary: "Portal links generated — verify records directly with government portals",
        indicators: [],
        chart_data: [],
        qualitative: [
          { label: "__land_payload__", value: JSON.stringify(data) },
        ],
        recommendations: [data.notes ?? ""],
        data_source: "Karnataka government portals — direct access required",
        loading: false,
        error: null,
      });
    } catch (err) {
      setModuleError("land", err instanceof Error ? err.message : "Failed");
    }
  }

  // Form — shown when no result yet
  if (!result || result.loading || !payload) {
    return (
      <div style={{ padding: "4px 0" }}>
        {/* Notice */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 6,
          padding: "8px 10px", borderRadius: 6, marginBottom: 10,
          background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <Info size={13} style={{ color: "#2563EB", marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: "#1E3A8A", margin: 0, lineHeight: 1.5 }}>
            Government land record portals require CAPTCHA login and cannot be queried
            automatically. Enter the survey details below — SAT will generate direct
            links to Bhoomi, KAVERI, and eCourts so you can verify records yourself.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <label style={LABEL_STYLE}>District</label>
              <input style={FIELD_STYLE} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Bengaluru Urban" required />
            </div>
            <div>
              <label style={LABEL_STYLE}>Taluk</label>
              <input style={FIELD_STYLE} value={taluk} onChange={(e) => setTaluk(e.target.value)} placeholder="Bengaluru North" required />
            </div>
            <div>
              <label style={LABEL_STYLE}>Hobli</label>
              <input style={FIELD_STYLE} value={hobli} onChange={(e) => setHobli(e.target.value)} placeholder="Jala" required />
            </div>
            <div>
              <label style={LABEL_STYLE}>Village</label>
              <input style={FIELD_STYLE} value={village} onChange={(e) => setVillage(e.target.value)} placeholder="Yelahanka" required />
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>Survey Number</label>
            <input style={FIELD_STYLE} value={surveyNumber} onChange={(e) => setSurveyNumber(e.target.value)} placeholder="123/4" required />
          </div>
          <button
            type="submit"
            disabled={result?.loading}
            style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 700,
              border: "none", borderRadius: 6, cursor: "pointer",
              background: "#5A8F6A", color: "#FDFCFB",
              opacity: result?.loading ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {result?.loading ? "Generating links…" : "Generate Portal Links"}
          </button>
          {result?.error && (
            <p style={{ fontSize: 11, color: "#EF4444", margin: 0 }}>{result.error}</p>
          )}
        </form>
      </div>
    );
  }

  // Results — portal links view
  const deepLinks = payload.deep_links ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Info notice */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        padding: "8px 10px", borderRadius: 6,
        background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
      }}>
        <Info size={13} style={{ color: "#2563EB", marginTop: 1, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: "#1E3A8A", margin: 0, lineHeight: 1.4 }}>
          Open each link below to verify records directly on government portals.
          No data is fetched automatically.
        </p>
      </div>

      {/* Deep links */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {deepLinks.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "8px 10px", borderRadius: 6,
              background: "#FDFCFB", border: "1px solid #E2E8F0",
              textDecoration: "none", color: "#3A3F3B",
            }}
          >
            <ExternalLink size={12} style={{ color: "#5A8F6A", flexShrink: 0, marginTop: 2 }} />
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, display: "block", color: "#3A3F3B" }}>{link.label}</span>
              <span style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.4, display: "block" }}>{link.description}</span>
            </div>
          </a>
        ))}
      </div>

      {/* Look up again */}
      <button
        onClick={() => setModuleResult("land", { ...result, qualitative: [] })}
        style={{
          padding: "5px 10px", fontSize: 11, fontWeight: 600,
          border: "1px solid #CFD6C4", borderRadius: 6, cursor: "pointer",
          background: "transparent", color: "#7B8F83", fontFamily: "inherit",
        }}
      >
        Change Survey Details
      </button>
    </div>
  );
}
