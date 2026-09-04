import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionActor } from "@/lib/supabase/server";
import { listAuditEvents } from "@/lib/bookings";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * GET /api/audit — operator-only (handbook §12 matrix).
 * Immutable trail of every state-changing action for dispute resolution:
 * 'who cancelled what, when, with what request ID'.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/audit" });

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { status: "error", code: "unauthorized", requestId },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }
  if (actor.role !== "operator") {
    return NextResponse.json(
      { status: "error", code: "forbidden", requestId },
      { status: 403, headers: { "x-request-id": requestId } },
    );
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
  const events = await listAuditEvents({ userId: actor.userId, role: actor.role }, limit);
  log.info({ count: events.length }, "audit served");
  return NextResponse.json(
    { status: "ok", events, requestId },
    { headers: { "x-request-id": requestId } },
  );
}
