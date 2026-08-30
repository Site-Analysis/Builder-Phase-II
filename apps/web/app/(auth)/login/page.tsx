// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

const MODULES = [
  { label: "Sun Path",    dot: "#F59E0B", bg: "rgba(245,158,11,0.10)",  text: "#8A6820", border: "rgba(245,158,11,0.22)" },
  { label: "Flood",       dot: "#5B93C9", bg: "rgba(91,147,201,0.10)",  text: "#3A6A99", border: "rgba(91,147,201,0.22)" },
  { label: "Temperature", dot: "#D97575", bg: "rgba(217,117,117,0.10)", text: "#A85050", border: "rgba(217,117,117,0.22)" },
  { label: "Wind",        dot: "#6BBFCC", bg: "rgba(107,191,204,0.10)", text: "#3A8999", border: "rgba(107,191,204,0.22)" },
  { label: "Rainfall",    dot: "#9B7EC8", bg: "rgba(155,126,200,0.10)", text: "#6A4FA0", border: "rgba(155,126,200,0.22)" },
];

const PREVIEW_SCORES = [
  { dot: "#F59E0B", score: 81, label: "Sun" },
  { dot: "#5B93C9", score: 58, label: "Flood" },
  { dot: "#D97575", score: 74, label: "Temp" },
  { dot: "#6BBFCC", score: 79, label: "Wind" },
  { dot: "#9B7EC8", score: 67, label: "Rain" },
];

// Illustrated architectural site plan — watercolour palette from inspiration
function SitePlanSVG() {
  return (
    <svg
      viewBox="0 0 560 700"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {/* Base — warm parchment */}
      <rect width="560" height="700" fill="#EAE5DF"/>

      {/* Water body — icy teal-blue */}
      <ellipse cx="62"  cy="290" rx="68" ry="52" fill="#B5D8E0"/>
      <ellipse cx="38"  cy="308" rx="38" ry="28" fill="#C2DFE7"/>
      <ellipse cx="85"  cy="268" rx="22" ry="16" fill="#BEDDE5" opacity="0.75"/>

      {/* Vegetation patches — sage mint */}
      <ellipse cx="178" cy="545" rx="52" ry="33" fill="#C8DDD5" opacity="0.70"/>
      <ellipse cx="432" cy="142" rx="40" ry="26" fill="#C4D9D1" opacity="0.65"/>
      <ellipse cx="498" cy="578" rx="34" ry="22" fill="#C8DDD5" opacity="0.60"/>
      <circle  cx="80"  cy="490" r="15" fill="#BDDAD2" opacity="0.72"/>
      <circle  cx="108" cy="514" r="11" fill="#C1DDD5" opacity="0.65"/>
      <circle  cx="488" cy="330" r="13" fill="#C4D9D1" opacity="0.60"/>
      <circle  cx="512" cy="350" r="9"  fill="#C8DDD5" opacity="0.55"/>

      {/* Major roads — dusty rose / salmon */}
      <line x1="0"   y1="180" x2="560" y2="195" stroke="#F3C3B2" strokeWidth="12"/>
      <line x1="0"   y1="420" x2="560" y2="408" stroke="#F3C3B2" strokeWidth="16"/>
      <line x1="145" y1="0"   x2="130" y2="700" stroke="#F3C3B2" strokeWidth="10"/>
      <line x1="360" y1="0"   x2="375" y2="700" stroke="#F3C3B2" strokeWidth="14"/>
      {/* Secondary roads — softer */}
      <line x1="0"   y1="310" x2="560" y2="316" stroke="#E8CEBE" strokeWidth="4"/>
      <line x1="255" y1="0"   x2="250" y2="700" stroke="#E8CEBE" strokeWidth="4"/>
      <line x1="0"   y1="560" x2="560" y2="552" stroke="#E8CEBE" strokeWidth="3"/>

      {/* City blocks — sage grey-green family */}
      <rect x="155" y="210" width="155" height="100" rx="5" fill="#CFD6C4" opacity="0.85"/>
      <rect x="325" y="210" width="165" height="100" rx="5" fill="#C8D1BB" opacity="0.80"/>
      <rect x="155" y="50"  width="140" height="110" rx="5" fill="#CFD6C4" opacity="0.75"/>
      <rect x="0"   y="430" width="120" height="100" rx="5" fill="#C5CEBB" opacity="0.75"/>
      <rect x="390" y="430" width="170" height="100" rx="5" fill="#CFD6C4" opacity="0.80"/>
      <rect x="155" y="335" width="90"  height="65"  rx="5" fill="#D5DCC9" opacity="0.70"/>
      <rect x="0"   y="570" width="130" height="80"  rx="5" fill="#C8D1BB" opacity="0.65"/>
      <rect x="395" y="575" width="165" height="90"  rx="5" fill="#CFD6C4" opacity="0.68"/>

      {/* White building footprints within blocks */}
      <rect x="165" y="222" width="60"  height="40" rx="3" fill="#F0EDE8" opacity="0.90"/>
      <rect x="236" y="218" width="52"  height="36" rx="3" fill="#EDEBE5" opacity="0.85"/>
      <rect x="340" y="222" width="72"  height="44" rx="3" fill="#EDE9E4" opacity="0.90"/>
      <rect x="166" y="62"  width="80"  height="52" rx="3" fill="#F0EDE8" opacity="0.85"/>
      <rect x="402" y="442" width="55"  height="40" rx="3" fill="#EDE9E4" opacity="0.90"/>
      <rect x="10"  y="580" width="44"  height="32" rx="2" fill="#EDE9E4" opacity="0.80"/>
      <rect x="60"  y="576" width="50"  height="36" rx="2" fill="#F0EDE8" opacity="0.75"/>

      {/* Site boundary — sky blue soft glow */}
      <circle cx="310" cy="335" r="92"  fill="rgba(153,205,216,0.07)"/>
      <circle cx="310" cy="335" r="66"  fill="rgba(153,205,216,0.10)"/>
      <circle cx="310" cy="335" r="52"  fill="rgba(153,205,216,0.07)" stroke="#99CDD8" strokeWidth="1.5" strokeDasharray="6 4"/>
      <circle cx="310" cy="335" r="7"   fill="#99CDD8"/>
      <circle cx="310" cy="335" r="3.5" fill="#FDFCFB"/>

      {/* Topographic contour lines — warm stone */}
      <ellipse cx="310" cy="335" rx="118" ry="74"  stroke="#C4B9AE" strokeWidth="0.85" fill="none"/>
      <ellipse cx="310" cy="335" rx="158" ry="102" stroke="#C4B9AE" strokeWidth="0.60" fill="none"/>
      <ellipse cx="310" cy="335" rx="202" ry="136" stroke="#C4B9AE" strokeWidth="0.45" fill="none"/>

      {/* Analysis heat dots near site pin */}
      <circle cx="295" cy="320" r="5" fill="#F59E0B" opacity="0.55"/>
      <circle cx="328" cy="350" r="5" fill="#5B93C9" opacity="0.55"/>
      <circle cx="307" cy="353" r="5" fill="#D97575" opacity="0.55"/>
      <circle cx="322" cy="318" r="5" fill="#6BBFCC" opacity="0.55"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function handleKeycloak() {
    setLoading(true);
    setError("");
    try {
      await signIn("keycloak", { callbackUrl: "/dashboard" });
    } catch {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      fontFamily: "var(--font-inter), sans-serif", fontSize: 14,
    }}>

      {/* ── Left: architectural site plan panel ─────────────────────── */}
      <div style={{ width: "46%", position: "relative", overflow: "hidden", background: "#EAE5DF" }}>
        <SitePlanSVG />

        {/* Warm scrim — keeps text legible over the map */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(234,229,223,0.08) 0%, rgba(234,229,223,0.28) 100%)",
        }}/>

        {/* Panel content */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "40px 44px",
        }}>
          {/* Logo */}
          <div>
            <img src="/qnit-logo.svg" alt="Qnit" style={{ height: 40, width: "auto" }} />
          </div>

          {/* Hero copy */}
          <div style={{ maxWidth: 320 }}>
            <div style={{
              fontSize: 28, fontWeight: 700, color: "#3A3F3B",
              lineHeight: 1.22, letterSpacing: "-0.5px", marginBottom: 12,
            }}>
              Every site decision,<br/>evidence-backed.
            </div>
            <div style={{ fontSize: 13, color: "#7B8F83", lineHeight: 1.65 }}>
              Climate, flood, solar, and regulatory data — unified in one authoritative workspace for architects and planners.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 18 }}>
              {MODULES.map((m) => (
                <span
                  key={m.label}
                  style={{
                    padding: "5px 11px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 5,
                    background: m.bg, color: m.text, border: `1px solid ${m.border}`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot, flexShrink: 0 }}/>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#B8C4BB" }}>© 2026 Qnit · All rights reserved · Data sources cited</div>
        </div>

        {/* Floating project score card */}
        <div style={{
          position: "absolute", bottom: 96, right: -16, width: 202,
          background: "#FDFCFB", borderRadius: 14,
          boxShadow: "0 8px 28px rgba(48,98,35,0.15), 0 2px 8px rgba(48,98,35,0.08)",
          padding: 14, border: "1px solid #CFD6C4",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3A3F3B", marginBottom: 2 }}>
            Bellandur Lakefront
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", marginBottom: 10 }}>Bengaluru · 5 modules</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PREVIEW_SCORES.map((s) => (
              <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, display: "block" }}/>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#3A3F3B",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}>{s.score}</span>
                <span style={{ fontSize: 8, color: "#B8C4BB" }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 8, padding: "4px 8px",
            background: "#DAEBE3", borderRadius: 6, border: "1px solid #CFD6C4",
            fontSize: 10, fontWeight: 500, color: "#4A6A5A",
          }}>
            Overall score: 72 / 100
          </div>
        </div>
      </div>

      {/* ── Right: sign-in panel ─────────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: "linear-gradient(160deg, #FDFCFB 0%, #F5F0EB 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 48, borderLeft: "1px solid #CFD6C4",
      }}>
        <div style={{ width: "100%", maxWidth: 360 }}>

          <div style={{ fontSize: 22, fontWeight: 700, color: "#3A3F3B", letterSpacing: "-0.3px" }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: "#7B8F83", marginTop: 4, marginBottom: 32 }}>
            Welcome back — your projects are waiting.
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#C46A6A", marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="button"
            onClick={handleKeycloak}
            disabled={loading}
            style={{
              width: "100%", height: 44,
              background: loading ? "#24491a" : "#306223",
              color: "white", border: "none", borderRadius: 10,
              fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: loading ? 0.8 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#24491a"; }}
            onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#306223"; }}
          >
            {loading ? "Redirecting…" : "Sign in with Qnit account"}
          </button>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#B8C4BB" }}>
            You&apos;ll be redirected to the Qnit identity portal.
          </div>
        </div>
      </div>
    </div>
  );
}
