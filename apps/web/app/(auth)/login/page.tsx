"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuthStore } from "@/lib/stores/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// ─── Module chips ─────────────────────────────────────────────────────────────
const MODULES = [
  { label: "Sun Path",    dot: "#F59E0B", bg: "rgba(245,158,11,0.10)",  text: "#B45309", border: "rgba(245,158,11,0.25)" },
  { label: "Flood",       dot: "#2563EB", bg: "rgba(37,99,235,0.08)",   text: "#1D4ED8", border: "rgba(37,99,235,0.20)" },
  { label: "Temperature", dot: "#EF4444", bg: "rgba(239,68,68,0.08)",   text: "#B91C1C", border: "rgba(239,68,68,0.20)" },
  { label: "Wind",        dot: "#06B6D4", bg: "rgba(6,182,212,0.08)",   text: "#0E7490", border: "rgba(6,182,212,0.20)" },
  { label: "Rainfall",    dot: "#7C3AED", bg: "rgba(124,58,237,0.08)",  text: "#6D28D9", border: "rgba(124,58,237,0.20)" },
];

// ─── Preview card scores ──────────────────────────────────────────────────────
const PREVIEW_SCORES = [
  { dot: "#F59E0B", score: 81, label: "Sun" },
  { dot: "#2563EB", score: 58, label: "Flood" },
  { dot: "#EF4444", score: 74, label: "Temp" },
  { dot: "#06B6D4", score: 79, label: "Wind" },
  { dot: "#7C3AED", score: 67, label: "Rain" },
];

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<"signin" | "signup">("signin");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fn = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });
    const { data, error: authError } = await fn;
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    if (data.user && data.session) {
      setAuth(data.user, data.session);
      router.push("/dashboard");
    } else if (mode === "signup") {
      setError("Check your email to confirm your account.");
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/dashboard` } });
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 14 }}>

      {/* ── Left: map panel ─────────────────────────────────────────── */}
      <div style={{ width: "46%", position: "relative", overflow: "hidden", background: "#EEF3F7" }}>

        {/* SVG map background */}
        <svg viewBox="0 0 560 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <rect width="560" height="700" fill="#EEF3F7"/>
          {/* Road grid */}
          <line x1="0" y1="180" x2="560" y2="195" stroke="#D6E0E8" strokeWidth="10"/>
          <line x1="0" y1="420" x2="560" y2="408" stroke="#D6E0E8" strokeWidth="14"/>
          <line x1="0" y1="310" x2="560" y2="316" stroke="#E0E8EE" strokeWidth="5"/>
          <line x1="145" y1="0" x2="130" y2="700" stroke="#D6E0E8" strokeWidth="8"/>
          <line x1="360" y1="0" x2="375" y2="700" stroke="#D6E0E8" strokeWidth="12"/>
          <line x1="255" y1="0" x2="250" y2="700" stroke="#E0E8EE" strokeWidth="5"/>
          {/* City blocks */}
          <rect x="155" y="210" width="155" height="100" rx="5" fill="#DDE6EE"/>
          <rect x="325" y="210" width="165" height="100" rx="5" fill="#DBE4EC"/>
          <rect x="155" y="50"  width="140" height="110" rx="5" fill="#DDE6EE"/>
          <rect x="0"   y="430" width="120" height="100" rx="5" fill="#DDE6EE"/>
          <rect x="390" y="430" width="170" height="100" rx="5" fill="#DBE4EC"/>
          <rect x="155" y="335" width="90"  height="65"  rx="5" fill="#E0E8EE"/>
          {/* Water body */}
          <ellipse cx="68" cy="295" rx="55" ry="36" fill="#BDD9D4" opacity="0.7"/>
          {/* Site boundary glow */}
          <circle cx="310" cy="330" r="72" fill="rgba(46,125,111,0.06)"/>
          <circle cx="310" cy="330" r="50" fill="rgba(46,125,111,0.08)"/>
          <circle cx="310" cy="330" r="50" stroke="#2E7D6F" strokeWidth="1.5" strokeDasharray="7 5" fill="none"/>
          <circle cx="310" cy="330" r="7"  fill="#2E7D6F"/>
          {/* Contour lines */}
          <ellipse cx="310" cy="330" rx="110" ry="70"  stroke="#C8D8E2" strokeWidth="1"   fill="none"/>
          <ellipse cx="310" cy="330" rx="150" ry="100" stroke="#C8D8E2" strokeWidth="0.8" fill="none"/>
          <ellipse cx="310" cy="330" rx="195" ry="135" stroke="#C8D8E2" strokeWidth="0.6" fill="none"/>
          {/* Module heat dots */}
          <circle cx="290" cy="315" r="5" fill="#F59E0B" opacity="0.55"/>
          <circle cx="325" cy="345" r="5" fill="#2563EB" opacity="0.55"/>
          <circle cx="305" cy="348" r="5" fill="#EF4444" opacity="0.55"/>
          <circle cx="320" cy="316" r="5" fill="#06B6D4" opacity="0.55"/>
        </svg>

        {/* Scrim */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,rgba(238,243,247,0.15) 0%,rgba(238,243,247,0.35) 100%)" }}/>

        {/* Content */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 44px" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, background: "#1A3A5C", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 20 20" width={18} height={18} fill="white">
                <path d="M10 1L3 6v8l7 5 7-5V6L10 1zm0 2.8L15.3 7.5v5.7L10 16.4l-5.3-3.2V7.5L10 3.8z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1A3A5C" }}>SAT</div>
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>Site Analysis Tool</div>
            </div>
          </div>

          {/* Hero */}
          <div style={{ maxWidth: 320 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1A3A5C", lineHeight: 1.22, letterSpacing: "-0.5px", marginBottom: 12 }}>
              Every site decision,<br/>evidence-backed.
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.65 }}>
              Climate, flood, solar, and regulatory data — unified in one authoritative workspace for architects and planners.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 18 }}>
              {MODULES.map((m) => (
                <span key={m.label} style={{ padding: "5px 11px", borderRadius: 9999, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 5, background: m.bg, color: m.text, border: `1px solid ${m.border}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot, flexShrink: 0 }}/>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#CBD5E1" }}>© 2025 Site Analysis Tool · All data sources cited</div>
        </div>

        {/* Floating score card */}
        <div style={{ position: "absolute", bottom: 96, right: -16, width: 200, background: "#FFFFFF", borderRadius: 14, boxShadow: "0 8px 28px rgba(26,58,92,0.14)", padding: 14, border: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#0F172A", marginBottom: 2 }}>Bellandur Lakefront</div>
          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 10 }}>Bengaluru · 5 modules</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PREVIEW_SCORES.map((s) => (
              <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, display: "block" }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", fontFamily: "var(--font-geist-mono), monospace" }}>{s.score}</span>
                <span style={{ fontSize: 8, color: "#CBD5E1" }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: "4px 8px", background: "#F0FDF9", borderRadius: 6, border: "1px solid rgba(46,125,111,0.18)", fontSize: 10, fontWeight: 500, color: "#2E7D6F" }}>
            Overall score: 72 / 100
          </div>
        </div>
      </div>

      {/* ── Right: form ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: 48, borderLeft: "1px solid #E2E8F0" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>

          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.3px" }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 26 }}>
            {mode === "signin" ? "Welcome back — your projects are waiting." : "Start analysing sites in minutes."}
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#0F172A", marginBottom: 5, display: "block" }}>Email address</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                style={{ width: "100%", height: 42, border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "0 13px", fontSize: 13, fontFamily: "inherit", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "#1A3A5C"; e.target.style.boxShadow = "0 0 0 3px rgba(26,58,92,0.08)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>Password</label>
                {mode === "signin" && (
                  <span style={{ fontSize: 11, color: "#2E7D6F", cursor: "pointer", fontWeight: 500 }}>Forgot password?</span>
                )}
              </div>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", height: 42, border: `1.5px solid ${error ? "#DC2626" : "#E2E8F0"}`, borderRadius: 10, padding: "0 13px", fontSize: 13, fontFamily: "inherit", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "#1A3A5C"; e.target.style.boxShadow = "0 0 0 3px rgba(26,58,92,0.08)"; }}
                onBlur={(e)  => { e.target.style.borderColor = error ? "#DC2626" : "#E2E8F0"; e.target.style.boxShadow = "none"; }}
              />
              {error && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 5 }}>{error}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{ width: "100%", height: 42, background: loading ? "#256B5F" : "#2E7D6F", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: 4, opacity: loading ? 0.8 : 1 }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#256B5F"; }}
              onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = "#2E7D6F"; }}
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }}/>
            <span style={{ fontSize: 11, color: "#CBD5E1" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }}/>
          </div>

          {/* Google */}
          <button
            type="button" onClick={handleGoogle}
            style={{ width: "100%", height: 42, background: "#FFFFFF", color: "#0F172A", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#F8F9FA"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "#FFFFFF"; }}
          >
            <svg width="17" height="17" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Toggle sign-in / sign-up */}
          <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "#64748B" }}>
            {mode === "signin" ? (
              <>Don&apos;t have an account?{" "}
                <span onClick={() => { setMode("signup"); setError(""); }} style={{ color: "#2E7D6F", fontWeight: 600, cursor: "pointer" }}>Sign up free</span>
              </>
            ) : (
              <>Already have an account?{" "}
                <span onClick={() => { setMode("signin"); setError(""); }} style={{ color: "#2E7D6F", fontWeight: 600, cursor: "pointer" }}>Sign in</span>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
