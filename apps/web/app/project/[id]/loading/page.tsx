"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { getProject } from "@/lib/api/projects";

// TODO GH#53: replace static snapshot with real analysis-store polling
type ModuleState = "done" | "active" | "queued";

interface ModRow {
  name: string;
  color: string;
  bgRgba: string;
  state: ModuleState;
  statusText: string;
}

const MOD_ROWS: ModRow[] = [
  { name: "Sun Path",    color: "#F59E0B", bgRgba: "rgba(245,158,11,0.10)", state: "done",   statusText: "Complete · pvlib 0.10.4"      },
  { name: "Flood",       color: "#2563EB", bgRgba: "rgba(37,99,235,0.08)",  state: "done",   statusText: "Complete · MERIT-Hydro · GEE" },
  { name: "Temperature", color: "#EF4444", bgRgba: "rgba(239,68,68,0.08)",  state: "active", statusText: "Fetching Open-Meteo data…"    },
  { name: "Wind",        color: "#06B6D4", bgRgba: "rgba(6,182,212,0.08)",  state: "queued", statusText: "Queued"                       },
  { name: "Rainfall",    color: "#7C3AED", bgRgba: "rgba(124,58,237,0.08)", state: "queued", statusText: "Queued"                       },
];

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

function StatusIcon({ state }: { state: ModuleState }) {
  if (state === "done") {
    return (
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: "rgba(22,163,74,0.12)", border: "1.5px solid rgba(22,163,74,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 700 }}>✓</span>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div
        className="animate-spin"
        style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          border: "2px solid #E2E8F0", borderTopColor: "#D97706",
        }}
      />
    );
  }
  return (
    <div style={{
      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
      background: "#F8F9FA", border: "1.5px solid #E2E8F0",
    }} />
  );
}

export default function LoadingPage() {
  const router   = useRouter();
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const [project, setProject] = useState<Awaited<ReturnType<typeof getProject>> | null>(null);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
  }, [user, router]);

  useEffect(() => {
    if (!id || !user) return;
    getProject(id).then((p) => setProject(p)).catch(console.error);
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const initials = getInitials(user);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F8F9FA" }}>
      <TopNav
        context="loading"
        breadcrumbs={[{ label: "← Cancel and edit", href: "/project/new" }]}
        userInitials={initials}
        userAvatarUrl={user?.user_metadata?.avatar_url}
      />

      <div style={{ paddingTop: 56, display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left config panel ─────────────────────────────── */}
        <div style={{
          width: 380, flexShrink: 0, background: "#FFFFFF",
          borderRight: "1px solid #E2E8F0",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "24px 24px 0" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Analysing your site</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, marginBottom: 20 }}>
              Running 5 modules in parallel. Do not close this tab.
            </div>
          </div>

          {/* Step dots */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 24px", marginBottom: 20 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 24, height: 4, borderRadius: 9999, background: "#2E7D6F" }} />
            ))}
            <span style={{ fontSize: 11, color: "#64748B", marginLeft: 4 }}>Step 3 of 3 — Running analysis</span>
          </div>

          {/* Site pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            margin: "0 24px 20px", padding: "10px 12px",
            background: "#F0FDF9", border: "1px solid rgba(46,125,111,0.18)", borderRadius: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E7D6F", flexShrink: 0, display: "inline-block" }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{project?.name ?? "—"}</div>
              <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--font-geist-mono), monospace" }}>
                {project?.coordinates ?? "—"}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div style={{ padding: "0 24px", flex: 1, overflowY: "auto" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.5px", color: "#CBD5E1", marginBottom: 12,
            }}>
              Module progress
            </div>

            {/* Overall bar */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#2E7D6F", fontFamily: "var(--font-geist-mono), monospace" }}>
                  42%
                </span>
                <span style={{ fontSize: 11, color: "#64748B" }}>~18 seconds remaining</span>
              </div>
              <div style={{ height: 6, background: "#E2E8F0", borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "42%", background: "#2E7D6F", borderRadius: 9999 }} />
              </div>
            </div>

            {/* Module rows */}
            {MOD_ROWS.map((row, i) => (
              <div
                key={row.name}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 0",
                  borderBottom: i < MOD_ROWS.length - 1 ? "1px solid #E2E8F0" : "none",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, background: row.bgRgba,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: row.color, display: "inline-block" }} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>{row.name}</div>
                  <div style={{
                    fontSize: 10, marginTop: 1,
                    color: row.state === "done" ? "#16A34A" : row.state === "active" ? "#D97706" : "#64748B",
                  }}>
                    {row.statusText}
                  </div>
                </div>

                <StatusIcon state={row.state} />
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* View results button — shown when all modules complete. TODO GH#53 */}
            <Link
              href="/project/new"
              style={{ fontSize: 11, color: "#64748B", textAlign: "center", textDecoration: "underline", cursor: "pointer" }}
            >
              Cancel and return to setup
            </Link>
          </div>
        </div>

        {/* ── Right: static map pane ───────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#C8D4DC" }}>

          {/* Map texture SVG (matches New Analysis background) */}
          <svg
            viewBox="0 0 820 700"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <rect width="820" height="700" fill="#C8D4DC" />
            <path d="M0 250 Q200 225 410 255 Q615 285 820 255" stroke="#B8C5CC" strokeWidth="10" fill="none" />
            <path d="M0 430 Q270 405 545 438 Q680 454 820 420" stroke="#BDC9D0" strokeWidth="8" fill="none" />
            <path d="M175 0 Q192 220 160 455 Q148 575 182 700" stroke="#BBC8CF" strokeWidth="9" fill="none" />
            <path d="M510 0 Q492 185 525 405 Q534 525 514 700" stroke="#BDC9D0" strokeWidth="6" fill="none" />
            <rect x="195" y="270" width="160" height="105" rx="4" fill="#BAC9D1" />
            <rect x="370" y="270" width="120" height="105" rx="4" fill="#BDC9D1" />
            <rect x="195" y="45" width="145" height="108" rx="4" fill="#BFC9D1" />
            <rect x="540" y="270" width="185" height="115" rx="4" fill="#BBC9D0" />
            <ellipse cx="90" cy="335" rx="65" ry="42" fill="#A8C0CC" opacity="0.7" />
          </svg>

          {/* Pulse rings + site pin — centered on map */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)", width: 12, height: 12,
          }}>
            <div
              className="animate-ping"
              style={{ position: "absolute", inset: -14, borderRadius: "50%", border: "2px solid #2E7D6F", opacity: 0.5 }}
            />
            <div
              className="animate-ping"
              style={{ position: "absolute", inset: -14, borderRadius: "50%", border: "2px solid #2E7D6F", opacity: 0.5, animationDelay: "0.55s" }}
            />
            <div style={{
              width: 12, height: 12, borderRadius: "50%", background: "#2E7D6F",
              border: "2.5px solid white", boxShadow: "0 0 0 4px rgba(46,125,111,0.2)",
              position: "relative", zIndex: 2,
            }} />
          </div>

          {/* Map label */}
          <div style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)",
            borderRadius: 8, padding: "6px 12px",
            fontSize: 12, fontWeight: 500, color: "#0F172A",
            border: "1px solid #E2E8F0",
          }}>
            {project?.name ?? "Site"} · {project?.coordinates ?? "—"}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: "absolute", bottom: 24, right: 24,
            background: "white", borderRadius: 8,
            border: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}>
            <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#64748B", borderBottom: "1px solid #E2E8F0", cursor: "pointer" }}>+</div>
            <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#64748B", cursor: "pointer" }}>−</div>
          </div>

          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, color: "rgba(0,0,0,0.35)", fontFamily: "var(--font-geist-mono), monospace" }}>
            © OpenStreetMap contributors
          </div>
        </div>

      </div>
    </div>
  );
}
