import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionActor } from "@/lib/supabase/server";
import { unblockSlot, toHttp } from "@/lib/bookings";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * DELETE /api/slot-blocks/:id — operator-only. Removes a block; the slot
 * returns to free and a PII-free availability event is broadcast.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/slot-blocks/[id]" });
  const { id } = await params;

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

  const outcome = await unblockSlot({ userId: actor.userId, role: actor.role }, id, {
    idempotencyKey: request.headers.get("x-idempotency-key") ?? undefined,
    requestId,
  });

  const { status, body } = toHttp(outcome);
  log.info({ outcomeKind: outcome.kind, httpStatus: status }, "unblock requested");
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}
