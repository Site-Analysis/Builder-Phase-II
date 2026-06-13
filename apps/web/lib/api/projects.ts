// Project persistence.
//
// There is no projects backend service yet (GH#53/#55). To let real site
// coordinates flow from New Analysis → the analysis page, created projects are
// persisted client-side in sessionStorage. The dashboard list below stays mock
// data until a projects service or Supabase table exists.
import type { Project, ProjectStats } from "../stores/project";

const SESSION_KEY = "sat.projects";

const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-1",
    name: "Bellandur Lakefront Mixed-Use",
    location: "Bellandur, Bengaluru",
    status: "needs-review",
    created_at: "2025-06-18T00:00:00Z",
    overall_score: 75,
    modules_run: ["sunpath", "flood", "temperature", "rainfall"],
    boundary: { type: "Point", coordinates: [77.6733, 12.9352] },
    coordinates: "12.93520, 77.67330",
  },
  {
    id: "proj-2",
    name: "Heldoit Tech Campus — Phase II",
    location: "Hebbal, Bengaluru",
    status: "complete",
    created_at: "2025-06-12T00:00:00Z",
    overall_score: 82,
    modules_run: ["sunpath", "flood", "temperature", "wind", "rainfall"],
    boundary: { type: "Point", coordinates: [77.5946, 13.0358] },
    coordinates: "13.03580, 77.59460",
  },
  {
    id: "proj-3",
    name: "Sarjapur Residential Township",
    location: "Sarjapur Road, Bengaluru",
    status: "complete",
    created_at: "2025-06-04T00:00:00Z",
    overall_score: 78,
    modules_run: ["sunpath", "flood", "temperature", "wind", "rainfall"],
    boundary: { type: "Point", coordinates: [77.7890, 12.8590] },
    coordinates: "12.85900, 77.78900",
  },
  {
    id: "proj-4",
    name: "Whitefield Retail Spine",
    location: "Whitefield, Bengaluru",
    status: "needs-review",
    created_at: "2024-11-19T00:00:00Z",
    overall_score: 61,
    modules_run: ["sunpath", "temperature", "wind"],
    boundary: { type: "Point", coordinates: [77.7500, 12.9698] },
    coordinates: "12.96980, 77.75000",
  },
  {
    id: "proj-5",
    name: "Devanahalli Logistics Park",
    location: "Devanahalli, Bengaluru",
    status: "complete",
    created_at: "2024-10-07T00:00:00Z",
    overall_score: 87,
    modules_run: ["sunpath", "flood", "temperature", "wind", "rainfall"],
    boundary: { type: "Point", coordinates: [77.7117, 13.2437] },
    coordinates: "13.24370, 77.71170",
  },
];

const MOCK_STATS: ProjectStats = {
  total: 5,
  fully_analysed: 3,
  needs_review: 2,
  this_month: 5,
};

function readSession(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "[]") as Project[];
  } catch {
    return [];
  }
}

function writeSession(projects: Project[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(projects));
}

export async function getProjects(): Promise<{ projects: Project[]; stats: ProjectStats }> {
  // TODO GH#53: replace mock list with a real projects query.
  const session = readSession();
  return {
    projects: [...session, ...MOCK_PROJECTS],
    stats: MOCK_STATS,
  };
}

export async function getProject(id: string): Promise<Project> {
  const found = readSession().find((p) => p.id === id) ?? MOCK_PROJECTS.find((p) => p.id === id);
  if (!found) throw new Error(`Project not found: ${id}`);
  return found;
}

export async function createProject(
  data: Pick<Project, "name" | "location"> & {
    boundary: GeoJSON.Geometry;
    modules_run?: Project["modules_run"];
  }
): Promise<Project> {
  // No projects backend (GH#55) — persist client-side so the analysis page can
  // read the real coordinates from the boundary.
  let coordinates = "";
  if (data.boundary.type === "Point" && Array.isArray(data.boundary.coordinates)) {
    const [lng, lat] = data.boundary.coordinates as number[];
    coordinates = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  const project: Project = {
    id: `proj-${Date.now()}`,
    name: data.name,
    location: data.location,
    status: "needs-review",
    created_at: new Date().toISOString(),
    boundary: data.boundary,
    coordinates,
    modules_run: data.modules_run ?? ["sunpath", "flood", "temperature", "wind", "rainfall"],
  };

  writeSession([project, ...readSession()]);
  return project;
}
