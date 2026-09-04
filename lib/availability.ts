import {
  BOOKING_WINDOW_DAYS,
  DEFAULT_RESOURCE_SLUG,
  isAlignedToKolkataHour,
  isWithinBookingWindow,
  slotsForDate,
  windowDates,
  type DaySlots,
} from "./slots";

export interface AvailabilitySource {
  /** starts_at (ISO) of confirmed bookings in the window */
  confirmedStarts: string[];
  /** starts_at (ISO) of slot blocks in the window */
  blockedStarts: string[];
}

/**
 * Pure view-builder for the authenticated occupancy view.
 * Returns occupancy (free / booked / blocked) and never booker identity.
 */
export function buildAvailabilityView(
  source: AvailabilitySource,
  now: Date,
  windowDays = BOOKING_WINDOW_DAYS,
): DaySlots[] {
  const confirmed = new Set(source.confirmedStarts);
  const blocked = new Set(source.blockedStarts);
  return windowDates(now, windowDays).map((date) => ({
    date,
    slots: slotsForDate(date, now).map((slot) => {
      let status = slot.status;
      if (confirmed.has(slot.startsAt)) status = "booked";
      else if (blocked.has(slot.startsAt)) status = "blocked";
      return { ...slot, status };
    }),
  }));
}

export interface BookingRulesResult {
  ok: boolean;
  reason?: "invalid_alignment" | "outside_window" | "slot_in_past";
}

/**
 * Exactly the v1 slot rules enforced before any insert:
 * aligned to the hour (Kolkata), within the next 7 days (Kolkata), in the future.
 */
export function checkBookingRules(
  startsAt: Date,
  now: Date,
  windowDays = BOOKING_WINDOW_DAYS,
): BookingRulesResult {
  if (!isAlignedToKolkataHour(startsAt)) return { ok: false, reason: "invalid_alignment" };
  if (startsAt.getTime() <= now.getTime()) return { ok: false, reason: "slot_in_past" };
  if (!isWithinBookingWindow(startsAt, now, windowDays))
    return { ok: false, reason: "outside_window" };
  return { ok: true };
}

/**
 * Canonical JSON for request hashing: the byte-stable form of the client's
 * logical request so that idempotency key reuse with a different payload is
 * detectable. Only the client-supplied fields participate.
 */
export function canonicalBookingPayload(resourceSlug: string, startsAt: string): string {
  return JSON.stringify({ resourceSlug: resourceSlug || DEFAULT_RESOURCE_SLUG, startsAt });
}
