"use client";

import Link from "next/link";
import { Settings, Map, Upload, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  onSettingsClick?: () => void;
  onExportClick?: () => void;
  onNewAnalysisClick?: () => void;
  className?: string;
}

export function TopNav({
  context,
  breadcrumbs,
  centerContent,
  rightContent,
  userAvatarUrl,
  userInitials = "U",
  onSettingsClick,
  onExportClick,
  onNewAnalysisClick,
  className,
}: TopNavProps) {
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
          aria-label="SAT — Site Analysis Tool"
        >
          <span className="w-[30px] h-[30px] bg-brand-primary rounded-lg flex items-center justify-content shrink-0" style={{ justifyContent: "center" }}>
            <Map size={15} className="text-white" aria-hidden />
          </span>
          <span className="text-[15px] font-bold text-brand-primary tracking-tight">SAT</span>
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
            <span className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-brand-primary bg-[#EFF6FF] cursor-default">
              Settings
            </span>
          </div>
        )}

        {/* Dashboard nav links */}
        {context === "dashboard" && (
          <div className="flex items-center gap-1">
            <span className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-brand-primary bg-[#EFF6FF] cursor-default">
              Projects
            </span>
            <button
              onClick={onSettingsClick}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-neutral-bg transition-colors"
            >
              Settings
            </button>
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
                      ? "text-brand-primary bg-[#EFF6FF] pointer-events-none"
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
            className="flex items-center gap-1.5 h-[34px] px-[14px] bg-brand-secondary text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={14} aria-hidden />
            New Analysis
          </button>
        )}

        {/* Analysis: Export icon button (teal) */}
        {context === "analysis" && onExportClick && (
          <button
            onClick={onExportClick}
            aria-label="Export report"
            className="flex h-8 w-8 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
            style={{ borderColor: "#2E7D6F", color: "#2E7D6F" }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#EAF2F1"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; }}
          >
            <Upload size={15} aria-hidden />
          </button>
        )}

        {/* Extra right content (e.g. layout toggle on Settings page) */}
        {rightContent}

        {/* Settings icon — hidden on the settings page itself */}
        {context !== "settings" && onSettingsClick && (
          <button
            onClick={onSettingsClick}
            aria-label={context === "dashboard" ? "Open settings" : "Settings"}
            className="flex h-8 w-8 items-center justify-center rounded border border-neutral-border bg-neutral-surface text-text-secondary hover:text-text-primary hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
          >
            <Settings size={15} aria-hidden />
          </button>
        )}

        {/* Avatar */}
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
      </div>
    </nav>
  );
}
