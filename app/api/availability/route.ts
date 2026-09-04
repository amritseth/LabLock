import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/supabase/server";
import { withTransaction } from "@/lib/db";
import { buildAvailabilityView, type AvailabilitySource } from "@/lib/availability";
import { fetchOccupancy } from "@/lib/bookings";
import { BOOKING_WINDOW_DAYS, DEFAULT_RESOURCE_SLUG } from "@/lib/slots";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";

/**
 * GET /api/availability — authenticated occupancy view (handbook §12 matrix).
 * Returns free / booked / blocked for the next 7 days (Asia/Kolkata).
 * NEVER returns booker identity. Anonymous access is rejected so that rate
 * limiting and quota enforcement stay possible (handbook §12).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

const querySchema = z.object({
  resource: z.string().min(1).max(64).optional(),
  days: z.coerce.number().int().min(1).max(BOOKING_WINDOW_DAYS).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/availability" });

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json(
      { status: "error", code: "unauthorized", requestId },
      { status: 401, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", code: "invalid_input", requestId },
      { status: 400, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  }

  const resourceSlug = parsed.data.resource ?? DEFAULT_RESOURCE_SLUG;
  const days = parsed.data.days ?? BOOKING_WINDOW_DAYS;
  const now = new Date();
  const fromIso = new Date(now.getTime() - 3_600_000).toISOString();
  const toIso = new Date(now.getTime() + days * 86_400_000 + 3_600_000).toISOString();

  try {
    const result = await withTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; slug: string; name: string; tz: string }>(
        `SELECT id, slug, name, tz FROM resources WHERE slug = $1 AND is_active = true`,
        [resourceSlug],
      );
      const resource = rows[0];
      if (!resource) return null;
      const source: AvailabilitySource = await fetchOccupancy(tx, resource.id, fromIso, toIso);
      return { resource, source };
    });

    if (!result) {
      return NextResponse.json(
        { status: "error", code: "resource_not_found", requestId },
        { status: 404, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
      );
    }

    const daysView = buildAvailabilityView(result.source, now, days);
    const body = {
      status: "ok",
      resourceId: result.resource.id,
      resourceSlug: result.resource.slug,
      resourceName: result.resource.name,
      tz: result.resource.tz,
      windowDays: days,
      generatedAt: now.toISOString(),
      days: daysView,
    };
    log.info({ resourceId: result.resource.id, windowDays: days }, "availability served");
    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    log.error({ err: error }, "availability query failed");
    return NextResponse.json(
      { status: "error", code: "internal", requestId },
      { status: 500, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  }
}
