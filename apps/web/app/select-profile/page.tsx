// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftingCompass, HardHat, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { useProfileStore, type ViewProfile } from "@/lib/stores/profile";

// Architect = green (climate suite) · Builders = amber (zoning + title) — the
// audience colour-coding established on the landing page.
const PROFILES = {
  architect: {
    label: "Architect",
    accent: "#306223",
    tint: "#EAF2E6",
    tagline: "Architects use it before the first sketch.",
    blurb: "Climate & environmental intelligence for design.",
    modules: ["Sun Path", "Risks", "Temperature", "Wind", "Rainfall"],
    Icon: DraftingCompass,
  },
  builder: {
    label: "Builders",
    accent: "#C4865A",
    tint: "#F7EEE6",
    tagline: "Builders use it before the land is bought.",
    blurb: "Zoning & title due-diligence for site decisions.",
    modules: ["Zoning", "Title & Documents"],
    Icon: HardHat,
  },
} as const;

export default function SelectProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [hovered, setHovered] = useState<ViewProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  function choose(p: ViewProfile) {
    if (busy) return;
    setBusy(true);
    setProfile(p);
    // Best-effort cross-device mirror — don't block navigation on it.
    router.replace("/dashboard");
  }

  return (
    <main className="fixed inset-0 flex flex-col md:flex-row bg-neutral-bg">
      {/* Heading overlay */}
      <div className="pointer-events-none absolute top-0 inset-x-0 z-10 flex flex-col items-center pt-7 gap-1.5">
        <img src="/qnit-logo.svg" alt="Qnit" className="h-7 w-auto" />
        <p
          className="text-[13px] font-semibold"
          style={{ color: "#7B8F83", fontFamily: "var(--font-space-grotesk)", letterSpacing: "0.02em" }}
        >
          Choose your workspace
        </p>
      </div>

      {(["architect", "builder"] as ViewProfile[]).map((key) => {
        const p = PROFILES[key];
        const isHover = hovered === key;
        const dim = hovered !== null && !isHover;
        const Icon = p.Icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            disabled={busy}
            aria-label={`Enter ${p.label} View`}
            className="relative flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center transition-all duration-300 ease-out focus:outline-none"
            style={{
              flexGrow: isHover ? 1.35 : dim ? 0.8 : 1,
              background: isHover ? p.tint : "var(--color-neutral-surface)",
              boxShadow: isHover ? `inset 0 0 0 2px ${p.accent}` : "inset 0 0 0 1px #CFD6C4",
              opacity: dim ? 0.6 : 1,
              cursor: busy ? "default" : "pointer",
            }}
          >
            <span
              className="flex items-center justify-center rounded-2xl transition-transform duration-300"
              style={{
                width: 76,
                height: 76,
                background: `${p.accent}14`,
                color: p.accent,
                transform: isHover ? "translateY(-4px) scale(1.04)" : "none",
              }}
            >
              <Icon size={36} strokeWidth={1.6} aria-hidden />
            </span>

            <div>
              <h2
                className="text-[26px] font-bold leading-tight"
                style={{ color: "#3A3F3B", fontFamily: "var(--font-space-grotesk)" }}
              >
                {p.label} View
              </h2>
              <p className="mt-1.5 text-[14px] font-semibold" style={{ color: p.accent }}>
                {p.tagline}
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: "#7B8F83" }}>
                {p.blurb}
              </p>
            </div>

            <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 max-w-[300px]">
              {p.modules.map((m) => (
                <li
                  key={m}
                  className="text-[11.5px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: `${p.accent}14`, color: p.accent }}
                >
                  {m}
                </li>
              ))}
            </ul>

            <span
              className="mt-2 inline-flex items-center gap-1.5 h-[38px] px-5 rounded-lg text-[13px] font-semibold text-white transition-opacity"
              style={{ background: p.accent, opacity: isHover ? 1 : 0.92 }}
            >
              Enter {p.label} View
              <ArrowRight size={15} aria-hidden />
            </span>
          </button>
        );
      })}
    </main>
  );
}
