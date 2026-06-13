"use client";

import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface ExportModule {
  id: string;
  name: string;
  color: string;
  score?: number;
  verdict?: string;
  included: boolean;
}

export interface ExportSettings {
  citations:           boolean;
  regulatoryCrossRefs: boolean;
  mapScreenshots:      boolean;
  charts:              boolean;
  language:            string;
  paperSize:           string;
  template:            "overview" | "detailed";
}

export interface ExportDrawerProps {
  projectName:     string;
  projectLocation: string;
  state:           "ready" | "generating";
  modules:         ExportModule[];
  settings:        ExportSettings;
  onModuleToggle:  (id: string, included: boolean) => void;
  onSettingChange: (key: keyof ExportSettings, value: boolean | string) => void;
  onGenerate:      () => void;
  onCancel:        () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: "#64748B",
      textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function InlineToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? "#1A3A5C" : "#E2E8F0",
        border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, width: 14, height: 14,
        borderRadius: "50%", background: "white",
        transition: "left 0.15s", left: checked ? 19 : 3,
      }} />
    </button>
  );
}

function InlineCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer",
        border: `1.5px solid ${checked ? "#1A3A5C" : "#CBD5E1"}`,
        background: checked ? "#1A3A5C" : "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.1s",
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden>
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function TemplateThumbnail({ id }: { id: "overview" | "detailed" }) {
  if (id === "overview") {
    return (
      <div style={{ height: 52, background: "#F1F5F9", borderRadius: 4, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 14, background: "#1A3A5C", flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[70, 50, 80, 40].map((w, i) => (
            <div key={i} style={{ height: 4, width: `${w}%`, background: "#CBD5E1", borderRadius: 2 }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: 52, background: "#F1F5F9", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 16, background: "#E2E8F0", margin: "8px 10px 4px" }} />
      <div style={{ height: 8, background: "#EFF6FF", margin: "0 10px 4px", borderRadius: 2 }} />
      <div style={{ height: 4, background: "#E2E8F0", margin: "0 10px", width: "60%", borderRadius: 2 }} />
    </div>
  );
}

function PdfPage({ modules, projectName, projectLocation }: {
  modules: ExportModule[];
  projectName: string;
  projectLocation: string;
}) {
  const included = modules.filter((m) => m.included);
  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
  return (
    <div style={{
      width: 480, background: "white", borderRadius: 4,
      boxShadow: "0 4px 24px rgba(0,0,0,0.18)", overflow: "hidden",
    }}>
      {/* Navy header */}
      <div style={{ background: "#1A3A5C", padding: "16px 20px 14px" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>
          Site Analysis Tool
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.25 }}>
          {projectName || "Untitled Project"}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
          Site Analysis Report
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 20px", marginTop: 10 }}>
          {[
            ["Location", projectLocation || "—"],
            ["Coordinates", "12.931°N, 77.641°E"],
            ["Generated", generatedDate],
            ["Report Type", "Overview"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 500, marginTop: 1 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 20px 20px" }}>
        {/* Score strip */}
        <div style={{ fontSize: 9, fontWeight: 600, color: "#1A3A5C", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          Overall Site Score
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {included.map((m) => (
            <div key={m.id} style={{
              flex: 1, background: m.color, borderRadius: 4, padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: "white",
                fontFamily: "var(--font-geist-mono), monospace",
              }}>
                {m.score ?? "—"}
              </div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.8)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {m.name}
              </div>
            </div>
          ))}
          <div style={{ flex: 1, background: "#2E7D6F", borderRadius: 4, padding: "6px 4px", textAlign: "center" }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: "white",
              fontFamily: "var(--font-geist-mono), monospace",
            }}>75</div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.8)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Overall
            </div>
          </div>
        </div>

        {/* Site map */}
        <div style={{ fontSize: 9, fontWeight: 600, color: "#1A3A5C", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          Site Map
        </div>
        <div style={{ height: 110, background: "#E8ECF0", borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
          <svg width="100%" height="110" viewBox="0 0 440 110" fill="none" aria-hidden>
            <rect width="440" height="110" fill="#E8ECF0" />
            <line x1="0" y1="55" x2="440" y2="55" stroke="#D1D5DB" strokeWidth="8" />
            <line x1="220" y1="0" x2="220" y2="110" stroke="#D1D5DB" strokeWidth="6" />
            <line x1="0" y1="28" x2="440" y2="84" stroke="#D1D5DB" strokeWidth="4" />
            <circle cx="220" cy="55" r="30" fill="rgba(26,58,92,0.08)" stroke="#1A3A5C" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="220" cy="50" r="5" fill="#1A3A5C" />
            <line x1="220" y1="55" x2="220" y2="63" stroke="#1A3A5C" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Module summary */}
        <div style={{ fontSize: 9, fontWeight: 600, color: "#1A3A5C", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          Module Summary
        </div>
        {included.map((m) => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 0", borderBottom: "1px solid #F1F5F9",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#0F172A", width: 76, flexShrink: 0 }}>{m.name}</span>
            <span style={{ fontSize: 10, color: "#64748B", flex: 1, lineHeight: 1.3 }}>
              {m.verdict ?? "Analysis complete"}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#0F172A", width: 22, textAlign: "right",
              fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0,
            }}>
              {m.score ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExportDrawer({
  projectName,
  projectLocation,
  state,
  modules,
  settings,
  onModuleToggle,
  onSettingChange,
  onGenerate,
  onCancel,
}: ExportDrawerProps) {
  const [page, setPage] = useState(1);
  const totalPages = 6;

  const TEMPLATES: { id: "overview" | "detailed"; name: string; desc: string }[] = [
    { id: "overview",  name: "Overview",  desc: "Summary + all modules"  },
    { id: "detailed",  name: "Detailed",  desc: "Full data per module"   },
  ];

  const BOOL_OPTIONS: { key: keyof ExportSettings; label: string }[] = [
    { key: "citations",           label: "Include data sources & citations"       },
    { key: "regulatoryCrossRefs", label: "Include regulatory cross-references"    },
    { key: "mapScreenshots",      label: "Include map screenshots"                },
    { key: "charts",              label: "Include charts & visualisations"        },
  ];

  const SELECT_OPTIONS: { key: keyof ExportSettings; label: string; options: string[] }[] = [
    { key: "language",  label: "Language",   options: ["English", "Hindi"]                    },
    { key: "paperSize", label: "Paper size", options: ["A4 Portrait", "A4 Landscape", "A3"]   },
  ];

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "7px 0", borderBottom: "1px solid #E2E8F0",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left config panel (360px) ──────────────────────────── */}
      <div style={{
        width: 360, flexShrink: 0, background: "white",
        borderRight: "1px solid #E2E8F0",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Export report</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            Infographic PDF{projectName ? ` · ${projectName}` : ""}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Template */}
          <section>
            <SectionLabel>Template</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TEMPLATES.map((t) => {
                const selected = settings.template === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSettingChange("template", t.id)}
                    style={{
                      border: `1.5px solid ${selected ? "#1A3A5C" : "#E2E8F0"}`,
                      borderRadius: 8, background: selected ? "#F0F5FF" : "white",
                      padding: 10, cursor: "pointer", textAlign: "left",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <TemplateThumbnail id={t.id} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: selected ? "#1A3A5C" : "#0F172A" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Modules */}
          <section>
            <SectionLabel>Modules to include</SectionLabel>
            <div>
              {modules.map((mod) => (
                <div key={mod.id} style={rowStyle}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: mod.color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#0F172A", flex: 1 }}>{mod.name}</span>
                  <InlineCheckbox checked={mod.included} onChange={(v) => onModuleToggle(mod.id, v)} />
                </div>
              ))}
            </div>
          </section>

          {/* Options */}
          <section>
            <SectionLabel>Options</SectionLabel>
            <div>
              {BOOL_OPTIONS.map(({ key, label }) => (
                <div key={key} style={rowStyle}>
                  <span style={{ fontSize: 12, color: "#0F172A", flex: 1 }}>{label}</span>
                  <InlineToggle
                    checked={settings[key] as boolean}
                    onChange={(v) => onSettingChange(key, v)}
                  />
                </div>
              ))}
              {SELECT_OPTIONS.map(({ key, label, options }) => (
                <div key={key} style={rowStyle}>
                  <span style={{ fontSize: 12, color: "#0F172A", flex: 1 }}>{label}</span>
                  <select
                    value={settings[key] as string}
                    onChange={(e) => onSettingChange(key, e.target.value)}
                    style={{
                      height: 28, padding: "0 8px 0 6px", borderRadius: 6,
                      border: "1.5px solid #E2E8F0", fontSize: 12, color: "#0F172A",
                      background: "#F8F9FA", cursor: "pointer", outline: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px 16px", borderTop: "1px solid #E2E8F0" }}>
          <button
            onClick={onGenerate}
            disabled={state === "generating" || modules.every((m) => !m.included)}
            style={{
              width: "100%", height: 40, borderRadius: 8, border: "none",
              background: state === "generating" ? "#256B5F" : "#2E7D6F",
              color: "white", fontSize: 13, fontWeight: 600, cursor: state === "generating" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: modules.every((m) => !m.included) ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            <Download size={14} aria-hidden />
            {state === "generating" ? "Generating…" : "Download PDF"}
          </button>
          <button
            onClick={onCancel}
            style={{
              width: "100%", height: 36, borderRadius: 8, marginTop: 8,
              border: "1.5px solid #E2E8F0", background: "none",
              color: "#64748B", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.borderColor = "#1A3A5C"; (e.currentTarget).style.color = "#1A3A5C"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.borderColor = "#E2E8F0"; (e.currentTarget).style.color = "#64748B"; }}
          >
            Cancel
          </button>
          <div style={{ fontSize: 10, color: "#94A3B8", textAlign: "center", marginTop: 10 }}>
            Estimated size: ~2.4 MB · {totalPages} pages
          </div>
        </div>
      </div>

      {/* ── Right preview panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Preview bar */}
        <div style={{
          height: 44, borderBottom: "1px solid #E2E8F0", background: "white",
          display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>Preview</span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1.5px solid #E2E8F0",
              background: "none", cursor: page === 1 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: page === 1 ? "#CBD5E1" : "#64748B",
            }}
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1.5px solid #E2E8F0",
              background: "none", cursor: page === totalPages ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: page === totalPages ? "#CBD5E1" : "#64748B",
            }}
          >
            <ChevronRight size={14} aria-hidden />
          </button>
          <span style={{
            marginLeft: "auto", fontSize: 12, color: "#64748B",
            fontFamily: "var(--font-geist-mono), monospace",
          }}>
            Page {page} / {totalPages}
          </span>
        </div>

        {/* PDF scroll area */}
        <div style={{
          flex: 1, background: "#E8ECF0", overflowY: "auto",
          display: "flex", justifyContent: "center", padding: "32px 24px",
        }}>
          {state === "generating" ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#64748B",
            }}>
              Generating PDF…
            </div>
          ) : (
            <PdfPage
              modules={modules}
              projectName={projectName}
              projectLocation={projectLocation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
