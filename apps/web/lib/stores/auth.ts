"use client";

import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  setAuth: (user: User, session: Session) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  setAuth: (user, session) => set({ user, session, isAuthenticated: true }),
  clearAuth: () => set({ user: null, session: null, isAuthenticated: false }),
}));
