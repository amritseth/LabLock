import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/supabase/server";
import { cancelBooking, toHttp } from "@/lib/bookings";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * DELETE /api/bookings/:id — cancel a booking (handbook §12 matrix).
 * Students cancel their own future slots; the operator cancels any.
 * State-changing, so an x-idempotency-key is required.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

const querySchema = z.object({
  reason: z.string().max(200).optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/bookings/[id]" });
  const { id } = await params;

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { status: "error", code: "unauthorized", requestId },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const outcome = await cancelBooking({ userId: actor.userId, role: actor.role }, id, {
    idempotencyKey: request.headers.get("x-idempotency-key") ?? undefined,
    requestId,
    cancelReason: parsed.success ? parsed.data.reason : undefined,
  });

  const { status, body } = toHttp(outcome);
  log.info({ outcomeKind: outcome.kind, httpStatus: status }, "cancel requested");
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}
