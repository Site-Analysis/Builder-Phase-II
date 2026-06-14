"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth";

// Reads the persisted Supabase session (incl. OAuth returns) back into the
// in-memory auth store before any page renders, and keeps it in sync. Gating
// render until the first session read avoids login-guard redirect flicker.
export function AuthHydrator({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const setAuth   = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session?.user) setAuth(data.session.user, data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setAuth(session.user, session);
      else clearAuth();
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [setAuth, clearAuth]);

  if (!ready) return null;
  return <>{children}</>;
}
