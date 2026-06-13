"use client";

import { create } from "zustand";

export type ModuleId = "flood" | "rainfall" | "sunpath" | "wind" | "temperature";
export type Severity = "high" | "moderate" | "low" | "none";

export interface Indicator {
  label: string;
  value: string;
  unit: string;
  barFraction: number;
  citation: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

// A self-describing chart. Single-series charts use one series with key "value";
// grouped/multi-line charts use several series, with each point carrying a value
// per series key.
export interface ModuleChart {
  title: string;
  kind: "bar" | "line" | "area" | "groupedBar" | "multiLine";
  unit?: string;
  series: ChartSeries[];
  points: Array<{ label: string } & Record<string, number | string>>;
}

export type QualitativeTone = "good" | "warn" | "bad" | "neutral";

export interface QualitativeStat {
  label: string;
  value: string;
  tone?: QualitativeTone;
}

export interface MetricGroup {
  group: string;
  rows: Array<{ label: string; value: string; unit?: string }>;
}

export interface ModuleResult {
  score: number;
  severity: Severity;
  summary: string;
  indicators: Indicator[];
  chart_data: ChartDataPoint[];
  charts?: ModuleChart[];
  qualitative?: QualitativeStat[];
  detailMetrics?: MetricGroup[];
  recommendations?: string[];
  data_source?: string;
  loading: boolean;
  error: string | null;
}

export interface SiteScore {
  overall_score: number;
  overall_severity: Severity;
  verdict_text: string;
  desc_text?: string;
  module_progress: { complete: number; total: number };
}

interface AnalysisState {
  modules: Partial<Record<ModuleId, ModuleResult>>;
  siteScore: SiteScore | null;
  setModuleResult: (id: ModuleId, result: ModuleResult) => void;
  setModuleLoading: (id: ModuleId) => void;
  setModuleError: (id: ModuleId, error: string) => void;
  setSiteScore: (score: SiteScore) => void;
  resetAnalysis: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  modules: {},
  siteScore: null,
  setModuleResult: (id, result) =>
    set((s) => ({ modules: { ...s.modules, [id]: result } })),
  setModuleLoading: (id) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...(s.modules[id] ?? {}), loading: true, error: null } as ModuleResult,
      },
    })),
  setModuleError: (id, error) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...(s.modules[id] ?? {}), loading: false, error } as ModuleResult,
      },
    })),
  setSiteScore: (score) => set({ siteScore: score }),
  resetAnalysis: () => set({ modules: {}, siteScore: null }),
}));
