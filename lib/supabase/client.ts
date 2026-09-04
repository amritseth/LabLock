"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — anon key only, RLS-protected, cookie sessions.
 * Used for OAuth flows and the Realtime availability channel.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
