"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { ExportDrawer, type ExportModule, type ExportSettings } from "@/components/layout/ExportDrawer";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { getProject } from "@/lib/api/projects";

const MODULE_META = [
  { id: "sunpath",     name: "Sun Path",    color: "#F59E0B" },
  { id: "flood",       name: "Flood",       color: "#2563EB" },
  { id: "temperature", name: "Temperature", color: "#EF4444" },
  { id: "wind",        name: "Wind",        color: "#06B6D4" },
  { id: "rainfall",    name: "Rainfall",    color: "#7C3AED" },
];

const DEFAULT_SETTINGS: ExportSettings = {
  citations:           true,
  regulatoryCrossRefs: true,
  mapScreenshots:      true,
  charts:              true,
  language:            "English",
  paperSize:           "A4 Portrait",
  template:            "overview",
};

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

export default function ExportPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { setCurrentProject } = useProjectStore();

  const [project, setProject] = useState<Awaited<ReturnType<typeof getProject>> | null>(null);
  const [modules, setModules] = useState<ExportModule[]>(
    MODULE_META.map((m) => ({ ...m, score: undefined, verdict: undefined, included: true }))
  );
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<"ready" | "generating">("ready");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
  }, [user, router]);

  useEffect(() => {
    if (!id || !user) return;
    getProject(id).then((p) => {
      setProject(p);
      setCurrentProject(p);
    }).catch(console.error);
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleModuleToggle(modId: string, included: boolean) {
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, included } : m)));
  }

  function handleSettingChange(key: keyof ExportSettings, value: boolean | string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleGenerate() {
    setState("generating");
    // TODO GH#54: POST to /api/projects/:id/export — endpoint format unconfirmed
    setTimeout(() => setState("ready"), 2000);
  }

  if (!user) return null;

  const initials = getInitials(user);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="analysis"
        breadcrumbs={[
          { label: "Projects",            href: "/dashboard"            },
          { label: project?.name ?? "…",  href: `/project/${id}`        },
          { label: "Export",              href: `/project/${id}/export` },
        ]}
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        onSettingsClick={() => router.push("/settings")}
      />
      <div className="pt-14 flex-1 overflow-hidden">
        <ExportDrawer
          projectName={project?.name ?? ""}
          projectLocation={project?.location ?? ""}
          state={state}
          modules={modules}
          settings={settings}
          onModuleToggle={handleModuleToggle}
          onSettingChange={handleSettingChange}
          onGenerate={handleGenerate}
          onCancel={() => router.push(`/project/${id}`)}
        />
      </div>
    </div>
  );
}
