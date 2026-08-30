// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

// Project persistence via /api/projects Next.js API routes.
// Those routes use the Supabase service-role key + Keycloak session validation.
// RLS is bypassed at DB level; user isolation enforced by server-side session check.

import type { Project, ProjectStats } from "../stores/project";

interface SatProjectRow {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  status: string;
  boundary: GeoJSON.Geometry | null;
  coordinates: string | null;
  area_sqm: number | null;
  modules_run: string[] | null;
  overall_score: number | null;
  created_at: string;
}

function rowToProject(row: SatProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    location: row.location ?? "",
    status: (row.status as Project["status"]) ?? "needs-review",
    boundary: row.boundary ?? undefined,
    coordinates: row.coordinates ?? undefined,
    area_sqm: row.area_sqm ?? undefined,
    modules_run: (row.modules_run as Project["modules_run"]) ?? [],
    overall_score: row.overall_score ?? undefined,
    created_at: row.created_at,
  };
}

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getProjects(): Promise<{ projects: Project[]; stats: ProjectStats }> {
  const { projects: rows, stats } = await apiCall<{
    projects: SatProjectRow[];
    stats: ProjectStats;
  }>("/api/projects");
  return { projects: rows.map(rowToProject), stats };
}

export async function getProject(id: string): Promise<Project> {
  const row = await apiCall<SatProjectRow>(`/api/projects/${id}`);
  return rowToProject(row);
}

export async function createProject(
  data: Pick<Project, "name" | "location"> & {
    boundary: GeoJSON.Geometry;
    modules_run?: Project["modules_run"];
  }
): Promise<Project> {
  const row = await apiCall<SatProjectRow>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return rowToProject(row);
}
