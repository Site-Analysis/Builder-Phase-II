"use client";

import { create } from "zustand";
import type { ModuleId } from "./analysis";

export interface Project {
  id: string;
  name: string;
  location: string;
  status: "complete" | "needs-review";
  thumbnail_url?: string;
  created_at: string;
  overall_score?: number;
  modules_run?: ModuleId[];
  star_rating?: number;
  boundary?: GeoJSON.Geometry;
  area_sqm?: number;
  coordinates?: string;
}

export interface ProjectStats {
  total: number;
  fully_analysed: number;
  needs_review: number;
  this_month: number;
}

interface ProjectState {
  projects: Project[];
  stats: ProjectStats | null;
  currentProject: Project | null;
  pendingProject: Partial<Project> | null;
  setProjects: (projects: Project[], stats: ProjectStats) => void;
  setCurrentProject: (project: Project) => void;
  setPendingProject: (project: Partial<Project> | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  stats: null,
  currentProject: null,
  pendingProject: null,
  setProjects: (projects, stats) => set({ projects, stats }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setPendingProject: (project) => set({ pendingProject: project }),
}));
