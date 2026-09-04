import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/callback — OAuth PKCE code exchange (handbook §12).
 * httpOnly cookie session is set by Supabase; never stores tokens in
 * localStorage. The auth redirect allowlist (RUNBOOK §Launch checklist)
 * must include local + preview + production origins only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const code = request.nextUrl.searchParams.get("code");
  const redirectTo = `/availability`;

  if (!supabase || !code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.code ?? "auth_failed")}`, request.url),
    );
  }
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
