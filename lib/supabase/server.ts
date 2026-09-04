import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { optionalEnv } from "@/lib/env";

/**
 * Supabase server client using httpOnly, same-site cookies
 * (handbook §12: secure cookie-based sessions, never localStorage).
 * Each call creates a request-scoped client bound to the incoming cookies.
 */
export async function getSupabaseServerClient() {
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore when middleware
          // is refreshing sessions.
        }
      },
    },
  });
}

export interface SessionActor {
  userId: string;
  email: string | null;
  role: "student" | "operator";
}

/**
 * Resolve the authenticated actor (user + profile role) for a route handler.
 * Authorization is: who you are (Supabase session) + what you may do (role in
 * profiles, mirrored by RLS) — handbook §12 Authentication vs authorization.
 */
export async function getSessionActor(): Promise<SessionActor | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile?.role === "operator" ? "operator" : "student",
  };
}
