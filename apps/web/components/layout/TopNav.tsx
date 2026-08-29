// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, Upload, Plus, LogOut, MapPin, ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/lib/stores/profile";
import { useUIStore } from "@/lib/stores/ui";

export interface Breadcrumb {
  label: string;
  href: string;
}

export interface TopNavProps {
  context: "dashboard" | "analysis" | "new-analysis" | "settings" | "loading";
  breadcrumbs?: Breadcrumb[];
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  userAvatarUrl?: string;
  userInitials?: string;
  userName?: string;
  userEmail?: string;
  onSettingsClick?: () => void;
  onSignOut?: () => void;
  onExportClick?: () => void;
  onNewAnalysisClick?: () => void;
  onCurrentLocationClick?: () => void;
  showCurrentLocation?: boolean;
  viewProfile?: "architect" | "builder";
  onSwitchProfile?: () => void;
  className?: string;
}

export function TopNav({
  context,
  breadcrumbs,
  centerContent,
  rightContent,
  userAvatarUrl,
  userInitials = "U",
  userName,
  userEmail,
  onSettingsClick,
  onSignOut,
  onExportClick,
  onNewAnalysisClick,
  onCurrentLocationClick,
  showCurrentLocation,
  viewProfile,
  onSwitchProfile,
  className,
}: TopNavProps) {
  const router = useRouter();
  const storeProfile = useProfileStore((s) => s.profile);
  const { nightMode, toggleNightMode } = useUIStore();
  // Self-source the active profile + switch action so every TopNav page shows the
  // badge without prop-threading; explicit props still override.
  const effectiveProfile = viewProfile ?? storeProfile ?? undefined;
  const switchProfile = onSwitchProfile ?? (() => router.push("/select-profile"));
  const isBuilder = effectiveProfile === "builder";
  const profileAccent = isBuilder ? "#C4865A" : "#306223";
  const profileLabel = isBuilder ? "Builders" : "Architect";
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  return (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-50 h-14 flex items-center px-6",
        "border-b border-neutral-border bg-neutral-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        className
      )}
      aria-label="Main navigation"
    >
      {/* ── Left: logo + nav links / breadcrumbs ───────────────── */}
      <div className="flex items-center gap-6 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2"
          aria-label="Qnit"
        >
          <img src="/qnit-logo.svg" alt="Qnit" className="h-7 w-auto" />
        </Link>

        {/* Settings nav links — reversed active state */}
        {context === "settings" && (
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-neutral-bg transition-colors"
            >
              Projects
            </Link>
          </div>
        )}

        {/* Dashboard nav links */}
        {context === "dashboard" && (
          <div className="flex items-center gap-1">
            <span className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-brand-primary bg-brand-secondary-tint cursor-default">
              Projects
            </span>
          </div>
        )}

        {/* Analysis / new-analysis / loading breadcrumbs as nav pills */}
        {context !== "dashboard" && breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => {
              // "loading" context: all breadcrumbs remain clickable (back link behaviour)
              const isActive = context !== "loading" && i === breadcrumbs.length - 1;
              return (
                <Link
                  key={crumb.href}
                  href={crumb.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                    isActive
                      ? "text-brand-primary bg-brand-secondary-tint pointer-events-none"
                      : "text-text-secondary hover:text-text-primary hover:bg-neutral-bg"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {crumb.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* ── Center slot (optional) ──────────────────────────────── */}
      {centerContent && (
        <div className="flex-1 flex items-center px-4 min-w-0">
          {centerContent}
        </div>
      )}

      {/* ── Right: actions + avatar ─────────────────────────────── */}
      <div className={cn("flex items-center gap-2", !centerContent && "ml-auto")}>
        {/* Dashboard: New Analysis button */}
        {context === "dashboard" && onNewAnalysisClick && (
          <button
            onClick={onNewAnalysisClick}
            className="flex items-center gap-1.5 h-[34px] px-[14px] bg-brand-primary text-white text-[13px] font-semibold rounded-lg hover:opacity-80 transition-opacity"
          >
            <Plus size={14} aria-hidden />
            New Analysis
          </button>
        )}

        {/* New analysis: Use current location button */}
        {context === "new-analysis" && showCurrentLocation && onCurrentLocationClick && (
          <button
            onClick={onCurrentLocationClick}
            className="flex items-center gap-1.5 h-[34px] px-[14px] text-[13px] font-semibold rounded-lg border-[1.5px] transition-colors"
            style={{ borderColor: "#306223", color: "#306223" }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#DAEBE3"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; }}
          >
            <MapPin size={14} aria-hidden />
            Use current location
          </button>
        )}

        {/* Analysis: Export icon button (teal) */}
        {context === "analysis" && onExportClick && (
          <button
            onClick={onExportClick}
            aria-label="Export report"
            className="flex h-8 w-8 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
            style={{ borderColor: "#99CDD8", color: "#99CDD8" }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#DAEBE3"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; }}
          >
            <Upload size={15} aria-hidden />
          </button>
        )}

        {/* Extra right content (e.g. layout toggle on Settings page) */}
        {rightContent}

        {/* Global night/day toggle */}
        <button
          onClick={toggleNightMode}
          title={nightMode ? "Switch to day mode" : "Switch to night mode"}
          aria-label={nightMode ? "Day mode" : "Night mode"}
          className="flex h-8 w-8 items-center justify-center rounded border border-neutral-border bg-neutral-surface hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
          style={nightMode ? { background: "#1a1f2e", borderColor: "#3a4460" } : undefined}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>{nightMode ? "☀️" : "🌙"}</span>
        </button>

        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            aria-label={context === "dashboard" ? "Open settings" : "Settings"}
            className="flex h-8 w-8 items-center justify-center rounded border border-neutral-border bg-neutral-surface text-text-secondary hover:text-text-primary hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
          >
            <Settings size={15} aria-hidden />
          </button>
        )}

        {/* View-profile badge → quick switch */}
        {effectiveProfile && (
          <button
            onClick={switchProfile}
            title="Switch profile"
            aria-label={`Current profile: ${profileLabel} View. Switch profile.`}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[12px] font-semibold transition-opacity hover:opacity-80"
            style={{ borderColor: `${profileAccent}55`, color: profileAccent, background: `${profileAccent}14` }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: profileAccent }} />
            {profileLabel}
          </button>
        )}

        {/* Avatar + profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            aria-label="Open profile"
            aria-expanded={profileOpen}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary rounded-full"
          >
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="User avatar"
                className="h-8 w-8 rounded-full object-cover border border-neutral-border"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-brand-primary flex items-center justify-center text-[12px] font-semibold text-white">
                {userInitials}
              </div>
            )}
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl border border-neutral-border bg-neutral-surface shadow-lg z-50 overflow-hidden"
              role="menu"
            >
              {/* User info header */}
              <div className="px-4 py-3 border-b border-neutral-border">
                <div className="flex items-center gap-3">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="" className="h-9 w-9 rounded-full object-cover border border-neutral-border shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-brand-primary flex items-center justify-center text-[13px] font-semibold text-white shrink-0">
                      {userInitials}
                    </div>
                  )}
                  <div className="min-w-0">
                    {userName && <p className="text-[13px] font-semibold text-text-primary truncate">{userName}</p>}
                    {userEmail && <p className="text-[11px] text-text-secondary truncate">{userEmail}</p>}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  role="menuitem"
                  onClick={() => { setProfileOpen(false); switchProfile(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-text-primary hover:bg-neutral-bg transition-colors text-left"
                >
                  <ArrowLeftRight size={14} className="text-text-secondary shrink-0" aria-hidden />
                  Switch profile{effectiveProfile ? ` · ${profileLabel}` : ""}
                </button>
                {onSettingsClick && (
                  <button
                    role="menuitem"
                    onClick={() => { setProfileOpen(false); onSettingsClick(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-text-primary hover:bg-neutral-bg transition-colors text-left"
                  >
                    <Settings size={14} className="text-text-secondary shrink-0" aria-hidden />
                    Settings
                  </button>
                )}
                {onSignOut && (
                  <button
                    role="menuitem"
                    onClick={() => { setProfileOpen(false); onSignOut(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors text-left"
                  >
                    <LogOut size={14} className="shrink-0" aria-hidden />
                    Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
