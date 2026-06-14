"use client";

import { createClient } from "@supabase/supabase-js";

// Single browser Supabase client — shared across pages so the auth session
// (including OAuth returns) persists in one place and is read back on load.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // parses ?code= on the OAuth callback
      flowType: "pkce",
    },
  },
);
