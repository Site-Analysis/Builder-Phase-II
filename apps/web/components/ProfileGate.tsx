// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
import { useProfileStore } from "@/lib/stores/profile";

// Authed app routes that require a chosen view profile. Public routes (/, /login)
// and the chooser itself (/select-profile) are intentionally excluded.
const AUTHED_PREFIXES = ["/dashboard", "/project", "/settings"];

// Global gate (mounted in the root layout under AuthHydrator): once a user is
// signed in but has no view profile, bounce to the chooser. Covers email login,
// OAuth returns, and deep-links from a single chokepoint.
export function ProfileGate() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const [hydrated, setHydrated] = useState(() => useProfileStore.persist.hasHydrated());

  // Wait for the persisted profile to rehydrate before deciding (avoids a
  // redirect flash on reload).
  useEffect(() => {
    if (hydrated) return;
    if (useProfileStore.persist.hasHydrated()) { setHydrated(true); return; }
    return useProfileStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !user || profile) return;
    const authed = AUTHED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (authed) router.replace("/select-profile");
  }, [hydrated, user, profile, pathname, router]);

  return null;
}
