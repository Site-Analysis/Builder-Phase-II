"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  User, Building2, Bell, Lock, SlidersHorizontal, FileOutput, AlertTriangle,
} from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type SidebarSection = "profile" | "studio" | "notifications" | "security" | "defaults" | "export";

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

// ─── Inline toggle (36×20, navy ON) ──────────────────────────────────────────
function InlineToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? "#657166" : "#CFD6C4",
        border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, width: 14, height: 14,
        borderRadius: "50%", background: "white",
        transition: "left 0.15s", left: checked ? 19 : 3,
      }} />
    </button>
  );
}

// ─── Field input ─────────────────────────────────────────────────────────────
function FieldInput({
  label, value, onChange, readOnly, placeholder,
}: {
  label: string; value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: "#3A3F3B", display: "block", marginBottom: 5 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          width: "100%", height: 40, border: "1.5px solid #CFD6C4", borderRadius: 8,
          padding: "0 11px", fontSize: 13, fontFamily: "inherit",
          background: readOnly ? "#F2EDE8" : "white",
          color: readOnly ? "#7B8F83" : "#3A3F3B", outline: "none",
        }}
        onFocus={(e) => { if (!readOnly) { e.target.style.borderColor = "#99CDD8"; e.target.style.boxShadow = "0 0 0 3px rgba(153,205,216,0.18)"; } }}
        onBlur={(e)  => { e.target.style.borderColor = "#CFD6C4"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}

// ─── Layout toggle pill (Sidebar | Tabs) ─────────────────────────────────────
function LayoutToggle({ mode, onChange }: { mode: "sidebar" | "tabs"; onChange: (m: "sidebar" | "tabs") => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: "#F2EDE8", border: "1px solid #CFD6C4",
      borderRadius: 9999, padding: 3, gap: 2,
    }}>
      {(["sidebar", "tabs"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            height: 26, padding: "0 12px", borderRadius: 9999, border: "none",
            background: mode === m ? "white" : "none",
            color: mode === m ? "#657166" : "#7B8F83",
            fontSize: 12, fontWeight: mode === m ? 600 : 500,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.1s", textTransform: "capitalize",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

const NOTIFICATIONS_META = [
  { key: "analysisComplete" as const, label: "Analysis complete",        desc: "Notify when all modules finish running"             },
  { key: "moduleFailure"    as const, label: "Module failure",           desc: "Alert when a module fails and needs retry"           },
  { key: "dataRefresh"      as const, label: "Data refresh available",   desc: "Newer dataset available for a saved project"         },
  { key: "productUpdates"   as const, label: "Product updates",          desc: "New modules, features, and release notes"            },
];

const SIDEBAR_ITEMS: {
  key: SidebarSection; label: string; icon: React.ReactNode; group: "account" | "prefs";
}[] = [
  { key: "profile",       label: "Profile",       icon: <User size={15} />,             group: "account" },
  { key: "studio",        label: "Studio",        icon: <Building2 size={15} />,        group: "account" },
  { key: "notifications", label: "Notifications", icon: <Bell size={15} />,             group: "account" },
  { key: "security",      label: "Security",      icon: <Lock size={15} />,             group: "account" },
  { key: "defaults",      label: "Defaults",      icon: <SlidersHorizontal size={15} />, group: "prefs"  },
  { key: "export",        label: "Export",        icon: <FileOutput size={15} />,       group: "prefs"   },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const [layoutMode, setLayoutMode]       = useState<"sidebar" | "tabs">("sidebar");
  const [activeSection, setActiveSection] = useState<SidebarSection>("profile");
  const [activeTab, setActiveTab]         = useState<"profile" | "studio" | "notifications" | "security" | "preferences">("profile");

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [studio,    setStudio]    = useState("");
  const [role,      setRole]      = useState("");

  const [notifications, setNotifications] = useState({
    analysisComplete: true,
    moduleFailure:    true,
    dataRefresh:      false,
    productUpdates:   true,
  });

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (user.user_metadata) {
      const fullName = user.user_metadata.full_name || "";
      const parts = fullName.trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
      setStudio(user.user_metadata.studio_name || "");
      setRole(user.user_metadata.role || "Architect");
    }
  }, [user, router]);

  async function handleSave() {
    setSaving(true);
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    await supabase.auth.updateUser({
      data: { full_name: fullName, studio_name: studio, role },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleDiscard() {
    if (user?.user_metadata) {
      const fullName = user.user_metadata.full_name || "";
      const parts = fullName.trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
      setStudio(user.user_metadata.studio_name || "");
      setRole(user.user_metadata.role || "Architect");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    clearAuth();
    router.replace("/login");
  }

  if (!user) return null;

  const initials = getInitials(user);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || user.email || "User";
  const studioDisplay = studio || user.user_metadata?.studio_name || "—";

  const toggleRow = (style?: React.CSSProperties) => ({
    display: "flex", alignItems: "center",
    padding: "11px 0", borderBottom: "1px solid #CFD6C4",
    ...style,
  } as React.CSSProperties);

  // ── Shared blocks ──────────────────────────────────────────────────────────

  function ProfileHero() {
    return (
      <div style={{
        background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 14,
        padding: "20px 24px", display: "flex", alignItems: "center", gap: 18,
        marginBottom: 20,
      }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%", background: "#657166",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, fontWeight: 600,
          }}>
            {initials}
          </div>
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: 20, height: 20, borderRadius: "50%",
            background: "#657166", border: "2px solid white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, color: "white", cursor: "pointer",
          }}>
            ✏
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#3A3F3B" }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "#7B8F83", marginTop: 2 }}>{user?.email}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{
              padding: "2px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: "rgba(101,113,102,0.08)", color: "#657166",
              border: "1px solid rgba(101,113,102,0.18)",
            }}>
              {studioDisplay}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: "rgba(90,143,106,0.10)", color: "#657166",
              border: "1px solid rgba(90,143,106,0.18)",
            }}>
              Starter plan
            </span>
          </div>
        </div>
        <button
          style={{
            height: 30, padding: "0 12px",
            background: "#F2EDE8", border: "1px solid #CFD6C4", borderRadius: 7,
            fontSize: 11, fontWeight: 500, cursor: "pointer", color: "#7B8F83",
            fontFamily: "inherit", flexShrink: 0,
          }}
        >
          Change photo
        </button>
      </div>
    );
  }

  function PersonalDetailsCard() {
    return (
      <div style={{ background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #CFD6C4" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#3A3F3B" }}>Personal details</div>
          <div style={{ fontSize: 12, color: "#7B8F83", marginTop: 2 }}>Your name and contact information.</div>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FieldInput label="First name" value={firstName} onChange={setFirstName} />
            <FieldInput label="Last name"  value={lastName}  onChange={setLastName}  />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldInput label="Email address" value={user?.email ?? ""} readOnly />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldInput label="Studio / organisation" value={studio} onChange={setStudio} placeholder="Your studio name" />
          </div>
          <FieldInput label="Role" value={role} onChange={setRole} placeholder="Architect" />
        </div>
        <div style={{
          padding: "10px 20px", borderTop: "1px solid #CFD6C4",
          display: "flex", justifyContent: "flex-end", gap: 8, background: "#F2EDE8",
        }}>
          <button
            onClick={handleDiscard}
            style={{
              height: 36, padding: "0 14px", background: "none", border: "1px solid #CFD6C4",
              borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#7B8F83", fontFamily: "inherit",
            }}
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 36, padding: "0 16px", background: "#657166", color: "white",
              border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    );
  }

  function NotificationsCard() {
    return (
      <div style={{ background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #CFD6C4" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#3A3F3B" }}>Notifications</div>
          <div style={{ fontSize: 12, color: "#7B8F83", marginTop: 2 }}>Choose when SAT alerts you.</div>
        </div>
        <div style={{ padding: "4px 20px" }}>
          {NOTIFICATIONS_META.map(({ key, label, desc }, i) => (
            <div key={key} style={toggleRow(i === NOTIFICATIONS_META.length - 1 ? { borderBottom: "none" } : {})}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#3A3F3B" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 2 }}>{desc}</div>
              </div>
              <InlineToggle
                checked={notifications[key]}
                onChange={(v) => setNotifications((prev) => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  function DangerZoneCard() {
    return (
      <div style={{ background: "#FDFCFB", border: "1px solid #FECACA", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #FECACA", background: "#FEF2F2" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#DC2626" }}>Danger zone</div>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <p style={{ fontSize: 13, color: "#7B8F83", lineHeight: 1.6, marginBottom: 14 }}>
            Permanently delete your account and all project data. This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSignOut}
              style={{
                height: 34, padding: "0 14px", background: "none", border: "1.5px solid #CFD6C4",
                borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#7B8F83", fontFamily: "inherit",
              }}
            >
              Sign out
            </button>
            <button
              style={{
                height: 34, padding: "0 14px", background: "none",
                border: "1.5px solid #DC2626", color: "#DC2626",
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Delete account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "profile"       as const, label: "Profile"       },
    { key: "studio"        as const, label: "Studio"        },
    { key: "notifications" as const, label: "Notifications" },
    { key: "security"      as const, label: "Security"      },
    { key: "preferences"   as const, label: "Preferences"   },
  ];

  function SectionHead({ label, danger }: { label: string; danger?: boolean }) {
    return (
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: danger ? "#DC2626" : "#3A3F3B",
        marginBottom: 10, marginTop: 28,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {label}
        <div style={{ flex: 1, height: 1, background: danger ? "#FECACA" : "#CFD6C4" }} />
      </div>
    );
  }

  function RowsContainer({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div style={{
        background: "#FDFCFB", border: "1px solid #CFD6C4", borderRadius: 12,
        padding: "0 16px", ...style,
      }}>
        {children}
      </div>
    );
  }

  function InlineRow({
    label, children, last,
  }: { label: string; children: React.ReactNode; last?: boolean }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", padding: "10px 0",
        borderBottom: last ? "none" : "1px solid #CFD6C4",
      }}>
        <span style={{ fontSize: 13, color: "#7B8F83", width: 160, flexShrink: 0 }}>{label}</span>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    );
  }

  function TabsInlineInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", height: 36, border: "1.5px solid #CFD6C4", borderRadius: 8,
          padding: "0 10px", fontSize: 13, fontFamily: "inherit",
          color: "#3A3F3B", outline: "none", background: "#FDFCFB",
        }}
        onFocus={(e) => { e.target.style.borderColor = "#99CDD8"; e.target.style.boxShadow = "0 0 0 3px rgba(153,205,216,0.18)"; }}
        onBlur={(e)  => { e.target.style.borderColor = "#CFD6C4"; e.target.style.boxShadow = "none"; }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="settings"
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        rightContent={<LayoutToggle mode={layoutMode} onChange={setLayoutMode} />}
      />

      <div className="pt-14 flex flex-col flex-1 overflow-hidden">

        {/* ── Tab bar (tabs mode only) ──────────────────────────── */}
        {layoutMode === "tabs" && (
          <div style={{
            height: 44, background: "#FDFCFB", borderBottom: "1px solid #CFD6C4",
            display: "flex", alignItems: "flex-end", padding: "0 32px", flexShrink: 0,
          }}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    height: 44, padding: "0 14px", border: "none", background: "none",
                    fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
                    color: active ? "#657166" : "#7B8F83", fontFamily: "inherit",
                    borderBottom: `2px solid ${active ? "#657166" : "transparent"}`,
                    marginBottom: -1, whiteSpace: "nowrap",
                    transition: "color 0.1s, border-color 0.1s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar (sidebar mode only) */}
          {layoutMode === "sidebar" && (
            <div style={{
              width: 220, flexShrink: 0, background: "#FDFCFB",
              borderRight: "1px solid #CFD6C4", padding: "20px 12px",
              display: "flex", flexDirection: "column", gap: 2,
              overflowY: "auto",
            }}>
              {(["account", "prefs"] as const).map((group) => (
                <div key={group}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.5px", color: "#CFD6C4",
                    padding: "0 8px", marginBottom: 4, marginTop: group === "prefs" ? 14 : 0,
                  }}>
                    {group === "account" ? "Account" : "Preferences"}
                  </div>
                  {SIDEBAR_ITEMS.filter((s) => s.group === group).map((item) => {
                    const active = activeSection === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveSection(item.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
                          borderRadius: 8, width: "100%", border: "none", cursor: "pointer",
                          textAlign: "left", fontFamily: "inherit",
                          background: active ? "#DAEBE3" : "none",
                          color: active ? "#657166" : "#7B8F83",
                          fontSize: 13, fontWeight: active ? 500 : 400,
                        }}
                        onMouseEnter={(e) => { if (!active) { (e.currentTarget).style.background = "#F2EDE8"; (e.currentTarget).style.color = "#3A3F3B"; } }}
                        onMouseLeave={(e) => { if (!active) { (e.currentTarget).style.background = "none"; (e.currentTarget).style.color = "#7B8F83"; } }}
                      >
                        <span style={{ opacity: active ? 1 : 0.45, display: "flex" }}>
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Danger zone at bottom */}
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#CFD6C4", padding: "0 8px", marginBottom: 4,
                }}>
                  Danger zone
                </div>
                <button
                  onClick={() => {}}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
                    borderRadius: 8, width: "100%", border: "none", cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit",
                    background: "none", color: "#DC2626", fontSize: 13,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.background = "#FEF2F2"; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; }}
                >
                  <AlertTriangle size={15} />
                  Delete account
                </button>
              </div>
            </div>
          )}

          {/* Content area */}
          <div style={{
            flex: 1, overflowY: "auto",
            padding: layoutMode === "sidebar" ? "32px 40px" : "28px 32px",
          }}>
            <div style={layoutMode === "tabs" ? { maxWidth: 640, margin: "0 auto" } : {}}>

              {/* ── Sidebar mode content ── */}
              {layoutMode === "sidebar" && (
                <>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#3A3F3B" }}>
                      {SIDEBAR_ITEMS.find((s) => s.key === activeSection)?.label ?? "Settings"}
                    </div>
                    <div style={{ fontSize: 13, color: "#7B8F83", marginTop: 3 }}>
                      Manage your personal details and preferences.
                    </div>
                  </div>

                  <ProfileHero />

                  {(activeSection === "profile" || activeSection === "studio") && (
                    <PersonalDetailsCard />
                  )}

                  {(activeSection === "profile" || activeSection === "notifications") && (
                    <NotificationsCard />
                  )}

                  <DangerZoneCard />
                </>
              )}

              {/* ── Tabs mode content ── */}
              {layoutMode === "tabs" && (
                <>
                  <ProfileHero />

                  {activeTab === "profile" && (
                    <>
                      <SectionHead label="Personal details" />
                      <RowsContainer>
                        <InlineRow label="First name">
                          <TabsInlineInput value={firstName} onChange={setFirstName} />
                        </InlineRow>
                        <InlineRow label="Last name">
                          <TabsInlineInput value={lastName} onChange={setLastName} />
                        </InlineRow>
                        <InlineRow label="Email address">
                          <span style={{ fontSize: 13, color: "#3A3F3B", flex: 1 }}>{user?.email}</span>
                          <button style={{ fontSize: 11, color: "#5A8F6A", cursor: "pointer", fontWeight: 500, background: "none", border: "none", marginLeft: 8, fontFamily: "inherit" }}>
                            Change →
                          </button>
                        </InlineRow>
                        <InlineRow label="Studio">
                          <TabsInlineInput value={studio} onChange={setStudio} />
                        </InlineRow>
                        <InlineRow label="Role" last>
                          <TabsInlineInput value={role} onChange={setRole} />
                        </InlineRow>
                      </RowsContainer>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 14 }}>
                        <button
                          onClick={handleDiscard}
                          style={{
                            height: 36, padding: "0 14px", background: "none",
                            border: "1px solid #CFD6C4", borderRadius: 8, fontSize: 12,
                            cursor: "pointer", color: "#7B8F83", fontFamily: "inherit",
                          }}
                        >
                          Discard
                        </button>
                        <button
                          onClick={handleSave}
                          style={{
                            height: 36, padding: "0 16px", background: "#657166", color: "white",
                            border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          {saved ? "Saved ✓" : saving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </>
                  )}

                  {activeTab === "notifications" && (
                    <>
                      <SectionHead label="Notifications" />
                      <RowsContainer>
                        {NOTIFICATIONS_META.map(({ key, label, desc }, i) => (
                          <div key={key} style={{
                            display: "flex", alignItems: "center", padding: "11px 0",
                            borderBottom: i === NOTIFICATIONS_META.length - 1 ? "none" : "1px solid #CFD6C4",
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#3A3F3B" }}>{label}</div>
                              <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 2 }}>{desc}</div>
                            </div>
                            <InlineToggle
                              checked={notifications[key]}
                              onChange={(v) => setNotifications((prev) => ({ ...prev, [key]: v }))}
                            />
                          </div>
                        ))}
                      </RowsContainer>
                    </>
                  )}

                  {(activeTab === "profile" || activeTab === "security") && (
                    <>
                      <SectionHead label="Danger zone" danger />
                      <RowsContainer style={{ border: "1px solid #FECACA" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#3A3F3B" }}>Delete account</div>
                            <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 2 }}>
                              Permanently deletes your account and all project data. Cannot be undone.
                            </div>
                          </div>
                          <button
                            style={{
                              height: 34, padding: "0 14px", background: "none",
                              border: "1.5px solid #DC2626", color: "#DC2626",
                              borderRadius: 8, fontSize: 12, fontWeight: 600,
                              cursor: "pointer", marginLeft: 16, flexShrink: 0, fontFamily: "inherit",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </RowsContainer>
                    </>
                  )}

                  {(activeTab === "studio" || activeTab === "preferences") && (
                    <div style={{ marginTop: 32, fontSize: 13, color: "#7B8F83", textAlign: "center" }}>
                      Coming soon
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
