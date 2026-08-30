// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase/server"

interface SatProjectRow {
  id: string
  user_id: string
  name: string
  location: string | null
  status: string
  boundary: object | null
  coordinates: string | null
  area_sqm: number | null
  modules_run: string[] | null
  overall_score: number | null
  created_at: string
}

function computeStats(projects: SatProjectRow[]) {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  return {
    total: projects.length,
    fully_analysed: projects.filter((p) => p.status === "complete").length,
    needs_review: projects.filter((p) => p.status === "needs-review").length,
    this_month: projects.filter((p) => new Date(p.created_at) >= monthStart).length,
  }
}

function polygonAreaSqm(ring: [number, number][]): number {
  if (ring.length < 4) return 0
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * Math.PI / 180
  const kx = 111_320 * Math.cos(lat0)
  const ky = 110_540
  const xy = ring.map(([lng, lat]) => [lng * kx, lat * ky])
  let a = 0
  for (let i = 0; i < xy.length - 1; i++) {
    a += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1]
  }
  return Math.abs(a / 2)
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ projects: [], stats: { total: 0, fully_analysed: 0, needs_review: 0, this_month: 0 } })
  }
  const { data, error } = await getSupabaseAdmin()
    .from("sat_projects")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const projects = (data ?? []) as SatProjectRow[]
  return Response.json({ projects, stats: computeStats(projects) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Supabase not configured — set SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 })
  }
  const body = await req.json()

  let coordinates = ""
  let area_sqm: number | undefined
  if (body.boundary?.type === "Point") {
    const [lng, lat] = body.boundary.coordinates as number[]
    coordinates = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } else if (body.boundary?.type === "Polygon") {
    const ring = body.boundary.coordinates[0] as [number, number][]
    const pts = ring.slice(0, -1)
    const clng = pts.reduce((s: number, p: [number, number]) => s + p[0], 0) / pts.length
    const clat = pts.reduce((s: number, p: [number, number]) => s + p[1], 0) / pts.length
    coordinates = `${clat.toFixed(5)}, ${clng.toFixed(5)}`
    area_sqm = polygonAreaSqm(ring)
  }

  const { data, error } = await getSupabaseAdmin()
    .from("sat_projects")
    .insert({
      user_id: session.user.id,
      name: body.name,
      location: body.location,
      status: "needs-review",
      boundary: body.boundary,
      coordinates,
      area_sqm: area_sqm ?? null,
      modules_run: body.modules_run ?? ["sunpath", "flood", "temperature", "wind", "rainfall"],
    })
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
