"use client";

import { Download, FileText, Table, Image as ImageIcon, Braces } from "lucide-react";

export interface ExportModule {
  id: string;
  name: string;
  color: string;
  score?: number;
  verdict?: string;
  included: boolean;
}

export interface ExportFormats {
  pdf:  boolean;
  csv:  boolean;
  png:  boolean;
  json: boolean;
}

export interface ExportSettings {
  citations:           boolean;
  regulatoryCrossRefs: boolean;
  charts:              boolean;
  language:            string;
  paperSize:           string;
  template:            "overview" | "detailed";
  formats:             ExportFormats;
}

export interface ExportDrawerProps {
  projectName:     string;
  state:           "ready" | "generating";
  modules:         ExportModule[];
  settings:        ExportSettings;
  preview:         React.ReactNode;
  onModuleToggle:  (id: string, included: boolean) => void;
  onSettingChange: (key: keyof Omit<ExportSettings, "formats">, value: boolean | string) => void;
  onFormatToggle:  (key: keyof ExportFormats, value: boolean) => void;
  onGenerate:      () => void;
  onCancel:        () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: "#7B8F83",
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
        background: checked ? "#657166" : "#CFD6C4",
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
        border: `1.5px solid ${checked ? "#657166" : "#B8C4BB"}`,
        background: checked ? "#657166" : "#FDFCFB",
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
      <div style={{ height: 52, background: "#F2EDE8", borderRadius: 4, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 14, background: "#657166", flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[70, 50, 80, 40].map((w, i) => (
            <div key={i} style={{ height: 4, width: `${w}%`, background: "#B8C4BB", borderRadius: 2 }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: 52, background: "#F2EDE8", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 16, background: "#CFD6C4", margin: "8px 10px 4px" }} />
      <div style={{ height: 8, background: "#DAEBE3", margin: "0 10px 4px", borderRadius: 2 }} />
      <div style={{ height: 4, background: "#CFD6C4", margin: "0 10px", width: "60%", borderRadius: 2 }} />
    </div>
  );
}

const FORMAT_META: { key: keyof ExportFormats; label: string; icon: React.ReactNode }[] = [
  { key: "pdf",  label: "PDF report", icon: <FileText size={15} aria-hidden />  },
  { key: "csv",  label: "CSV metrics", icon: <Table size={15} aria-hidden />    },
  { key: "png",  label: "PNG charts",  icon: <ImageIcon size={15} aria-hidden /> },
  { key: "json", label: "JSON data",   icon: <Braces size={15} aria-hidden />   },
];

export function ExportDrawer({
  projectName,
  state,
  modules,
  settings,
  preview,
  onModuleToggle,
  onSettingChange,
  onFormatToggle,
  onGenerate,
  onCancel,
}: ExportDrawerProps) {
  const TEMPLATES: { id: "overview" | "detailed"; name: string; desc: string }[] = [
    { id: "overview",  name: "Overview",  desc: "Summary + all modules"  },
    { id: "detailed",  name: "Detailed",  desc: "Full data per module"   },
  ];

  const BOOL_OPTIONS: { key: keyof Omit<ExportSettings, "formats">; label: string }[] = [
    { key: "citations",           label: "Include data sources & citations"    },
    { key: "regulatoryCrossRefs", label: "Include regulatory cross-references" },
    { key: "charts",              label: "Include graphs section"              },
  ];

  const SELECT_OPTIONS: { key: keyof Omit<ExportSettings, "formats">; label: string; options: string[] }[] = [
    { key: "language",  label: "Language",   options: ["English", "Hindi"]                    },
    { key: "paperSize", label: "Paper size", options: ["A4 Portrait", "A4 Landscape", "A3"]   },
  ];

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "7px 0", borderBottom: "1px solid #CFD6C4",
  };

  const selectedFormats = (Object.keys(settings.formats) as (keyof ExportFormats)[]).filter((k) => settings.formats[k]);
  const noModules = modules.every((m) => !m.included);
  const noFormats = selectedFormats.length === 0;
  const disabled  = state === "generating" || noModules || noFormats;

  const buttonLabel =
    state === "generating" ? "Generating…"
    : selectedFormats.length === 1 && settings.formats.pdf ? "Download PDF"
    : `Download (${selectedFormats.length} ${selectedFormats.length === 1 ? "file" : "files"})`;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left config panel (360px) ──────────────────────────── */}
      <div style={{
        width: 360, flexShrink: 0, background: "#FDFCFB",
        borderRight: "1px solid #CFD6C4",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #CFD6C4" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#3A3F3B" }}>Export report</div>
          <div style={{ fontSize: 12, color: "#7B8F83", marginTop: 2 }}>
            Site analysis{projectName ? ` · ${projectName}` : ""}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Formats */}
          <section>
            <SectionLabel>Formats to download</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FORMAT_META.map((f) => {
                const on = settings.formats[f.key];
                return (
                  <button
                    key={f.key}
                    onClick={() => onFormatToggle(f.key, !on)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      border: `1.5px solid ${on ? "#657166" : "#CFD6C4"}`,
                      borderRadius: 8, background: on ? "#DAEBE3" : "#FDFCFB",
                      padding: "9px 11px", cursor: "pointer", textAlign: "left",
                      color: on ? "#657166" : "#7B8F83", fontFamily: "inherit",
                    }}
                  >
                    {f.icon}
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

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
                      border: `1.5px solid ${selected ? "#657166" : "#CFD6C4"}`,
                      borderRadius: 8, background: selected ? "#FDE8D3" : "#FDFCFB",
                      padding: 10, cursor: "pointer", textAlign: "left",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <TemplateThumbnail id={t.id} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: selected ? "#657166" : "#3A3F3B" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 1 }}>{t.desc}</div>
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
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#3A3F3B", flex: 1 }}>{mod.name}</span>
                  {typeof mod.score === "number" && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#7B8F83", fontFamily: "var(--font-geist-mono), monospace" }}>{mod.score}</span>
                  )}
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
                  <span style={{ fontSize: 12, color: "#3A3F3B", flex: 1 }}>{label}</span>
                  <InlineToggle
                    checked={settings[key] as boolean}
                    onChange={(v) => onSettingChange(key, v)}
                  />
                </div>
              ))}
              {SELECT_OPTIONS.map(({ key, label, options }) => (
                <div key={key} style={rowStyle}>
                  <span style={{ fontSize: 12, color: "#3A3F3B", flex: 1 }}>{label}</span>
                  <select
                    value={settings[key] as string}
                    onChange={(e) => onSettingChange(key, e.target.value)}
                    style={{
                      height: 28, padding: "0 8px 0 6px", borderRadius: 6,
                      border: "1.5px solid #CFD6C4", fontSize: 12, color: "#3A3F3B",
                      background: "#F2EDE8", cursor: "pointer", outline: "none",
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
        <div style={{ padding: "14px 20px 16px", borderTop: "1px solid #CFD6C4" }}>
          <button
            onClick={onGenerate}
            disabled={disabled}
            style={{
              width: "100%", height: 40, borderRadius: 8, border: "none",
              background: state === "generating" ? "#4D5850" : "#657166",
              color: "white", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: (noModules || noFormats) ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            <Download size={14} aria-hidden />
            {buttonLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              width: "100%", height: 36, borderRadius: 8, marginTop: 8,
              border: "1.5px solid #CFD6C4", background: "none",
              color: "#7B8F83", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.borderColor = "#657166"; (e.currentTarget).style.color = "#657166"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.borderColor = "#CFD6C4"; (e.currentTarget).style.color = "#7B8F83"; }}
          >
            Cancel
          </button>
          {noFormats && (
            <div style={{ fontSize: 10, color: "#C46A6A", textAlign: "center", marginTop: 8 }}>
              Select at least one format
            </div>
          )}
        </div>
      </div>

      {/* ── Right preview panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Preview bar */}
        <div style={{
          height: 44, borderBottom: "1px solid #CFD6C4", background: "#FDFCFB",
          display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: "#7B8F83", fontWeight: 500 }}>Preview</span>
          <span style={{ fontSize: 11, color: "#B8C4BB" }}>Live report — reflects your selections</span>
        </div>

        {/* Report scroll area */}
        <div style={{
          flex: 1, background: "#F2EDE8", overflowY: "auto",
          display: "flex", justifyContent: "center", padding: "32px 24px",
        }}>
          {state === "generating" ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#7B8F83",
            }}>
              Generating export…
            </div>
          ) : (
            preview
          )}
        </div>
      </div>
    </div>
  );
}
