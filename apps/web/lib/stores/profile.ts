// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewProfile = "architect" | "builder";

// Which workspace the user is in. Persisted to localStorage so the post-login
// chooser only shows until a profile is set (first-time-then-remember).
interface ProfileState {
  profile: ViewProfile | null;
  setProfile: (p: ViewProfile) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (p) => set({ profile: p }),
      clearProfile: () => set({ profile: null }),
    }),
    { name: "qnit-view-profile" },
  ),
);
