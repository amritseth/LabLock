import "server-only";
import { withTransaction } from "./db";
import { fetchOccupancy } from "./bookings";
import { buildAvailabilityView, type AvailabilitySource } from "./availability";
import { BOOKING_WINDOW_DAYS, DEFAULT_RESOURCE_SLUG } from "./slots";

/**
 * Server-side availability loader shared by GET /api/availability and the
 * /availability page. Occupancy only — never booker identity.
 */
export interface AvailabilityPayload {
  resourceId: string;
  resourceSlug: string;
  resourceName: string;
  tz: string;
  windowDays: number;
  generatedAt: string;
  days: ReturnType<typeof buildAvailabilityView>;
}

export async function loadAvailability(options?: {
  resourceSlug?: string;
  days?: number;
  now?: Date;
}): Promise<AvailabilityPayload | null> {
  const resourceSlug = options?.resourceSlug ?? DEFAULT_RESOURCE_SLUG;
  const days = options?.days ?? BOOKING_WINDOW_DAYS;
  const now = options?.now ?? new Date();
  const fromIso = new Date(now.getTime() - 3_600_000).toISOString();
  const toIso = new Date(now.getTime() + days * 86_400_000 + 3_600_000).toISOString();

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; slug: string; name: string; tz: string }>(
      `SELECT id, slug, name, tz FROM resources WHERE slug = $1 AND is_active = true`,
      [resourceSlug],
    );
    const resource = rows[0];
    if (!resource) return null;

    const source: AvailabilitySource = await fetchOccupancy(tx, resource.id, fromIso, toIso);
    return {
      resourceId: resource.id,
      resourceSlug: resource.slug,
      resourceName: resource.name,
      tz: resource.tz,
      windowDays: days,
      generatedAt: now.toISOString(),
      days: buildAvailabilityView(source, now, days),
    };
  });
}
