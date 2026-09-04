import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/supabase/server";
import { blockSlot, toHttp } from "@/lib/bookings";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * POST /api/slot-blocks — operator-only (handbook §12 matrix).
 * Marks a slot as blocked (maintenance / blackout). Cannot be booked.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

const bodySchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  resourceSlug: z.string().min(1).max(64).optional(),
  reason: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/slot-blocks" });

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", code: "invalid_input", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const outcome = await blockSlot({ userId: actor.userId, role: actor.role }, parsed.data, {
    idempotencyKey: request.headers.get("x-idempotency-key") ?? undefined,
    requestId,
  });

  const { status, body } = toHttp(outcome);
  log.info({ outcomeKind: outcome.kind, httpStatus: status }, "slot block requested");
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}
