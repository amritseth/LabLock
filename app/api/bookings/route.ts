import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/supabase/server";
import { bookSlot, listMyBookings, toHttp } from "@/lib/bookings";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * POST /api/bookings — the core action (handbook §9, §10, §12 matrix).
 * Authenticated students (and the operator) book a one-hour slot.
 * Requires an x-idempotency-key header on every state-changing request.
 * Success 200 / conflict 409 shapes match handbook §9 examples exactly.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

const bodySchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  resourceSlug: z.string().min(1).max(64).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/bookings", method: "GET" });

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { status: "error", code: "unauthorized", requestId },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const mine = request.nextUrl.searchParams.get("mine") === "1";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const bookings = await listMyBookings(
    { userId: actor.userId, role: actor.role },
    Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
  );
  log.info({ count: bookings.length, mine }, "bookings listed");
  return NextResponse.json(
    { status: "ok", bookings, requestId },
    { headers: { "x-request-id": requestId } },
  );
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/bookings" });

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { status: "error", code: "unauthorized", requestId },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", code: "invalid_input", requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const outcome = await bookSlot({ userId: actor.userId, role: actor.role }, parsed.data, {
    idempotencyKey: request.headers.get("x-idempotency-key") ?? undefined,
    requestId,
  });

  const { status, body } = toHttp(outcome);
  log.info(
    { outcomeKind: outcome.kind, httpStatus: status, userId: actor.userId },
    `booking ${status === 200 && outcome.kind === "ok" ? "confirmed" : "rejected"}`,
  );
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}
