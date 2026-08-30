// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  nightMode: boolean;
  powerGridEnabled: boolean;
  toggleNightMode: () => void;
  setPowerGridEnabled: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      nightMode: false,
      powerGridEnabled: false,
      toggleNightMode: () => set((s) => ({ nightMode: !s.nightMode })),
      setPowerGridEnabled: (v) => set({ powerGridEnabled: v }),
    }),
    { name: "sat-ui" },
  ),
);
