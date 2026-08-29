// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

// Project persistence via Supabase sat_projects table (GH#53 resolved).
// RLS enforces user_id = auth.uid() — no server-side auth check needed here.

import { supabase } from "@/lib/supabase/client";
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

function polygonAreaSqm(ring: [number, number][]): number {
  if (ring.length < 4) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * Math.PI / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const xy = ring.map(([lng, lat]) => [lng * kx, lat * ky]);
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    a += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  }
  return Math.abs(a / 2);
}

export async function getProjects(): Promise<{ projects: Project[]; stats: ProjectStats }> {
  const { data, error } = await supabase
    .from("sat_projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const projects = ((data ?? []) as SatProjectRow[]).map(rowToProject);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const stats: ProjectStats = {
    total: projects.length,
    fully_analysed: projects.filter((p) => p.status === "complete").length,
    needs_review: projects.filter((p) => p.status === "needs-review").length,
    this_month: projects.filter((p) => new Date(p.created_at) >= monthStart).length,
  };

  return { projects, stats };
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from("sat_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Project not found: ${id}`);
  return rowToProject(data as SatProjectRow);
}

export async function createProject(
  data: Pick<Project, "name" | "location"> & {
    boundary: GeoJSON.Geometry;
    modules_run?: Project["modules_run"];
  }
): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let coordinates = "";
  let area_sqm: number | undefined;

  if (data.boundary.type === "Point" && Array.isArray(data.boundary.coordinates)) {
    const [lng, lat] = data.boundary.coordinates as number[];
    coordinates = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } else if (data.boundary.type === "Polygon" && Array.isArray(data.boundary.coordinates)) {
    const ring = data.boundary.coordinates[0] as [number, number][];
    const pts = ring.slice(0, -1);
    const clng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const clat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    coordinates = `${clat.toFixed(5)}, ${clng.toFixed(5)}`;
    area_sqm = polygonAreaSqm(ring);
  }

  const { data: row, error } = await supabase
    .from("sat_projects")
    .insert({
      user_id: user.id,
      name: data.name,
      location: data.location,
      status: "needs-review",
      boundary: data.boundary,
      coordinates,
      area_sqm: area_sqm ?? null,
      modules_run: data.modules_run ?? ["sunpath", "flood", "temperature", "wind", "rainfall"],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToProject(row as SatProjectRow);
}
