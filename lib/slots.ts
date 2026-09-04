import "server-only";

/**
 * Slice A slot rules — the fixed products rules shared by availability and
 * booking (handbook §4 Product rules v1):
 *   • One lab, one resource (slug: project-lab).
 *   • One-hour slots, aligned to the hour.
 *   • Booking window: next seven days, Asia/Kolkata.
 *
 * Asia/Kolkata (IST) is UTC+05:30 all year and has no DST, so the offset is a
 * fixed constant. A slot "aligned to the hour in Kolkata" therefore starts at
 * minute 30 past the hour in UTC. We deliberately use an explicit constant
 * instead of an IANA database lookup — it is simpler, deterministic, and
 * carries the invariant "minute 0 in IST" in a testable form.
 */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const SLOT_LENGTH_MS = 60 * 60 * 1000;
export const BOOKING_WINDOW_DAYS = 7;
export const DEFAULT_RESOURCE_SLUG = "project-lab";
export const KOLKATA_TZ = "Asia/Kolkata";

/**
 * Kolkata date string (YYYY-MM-DD) for the given instant.
 */
export function kolkataDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * UTC instant of a Kolkata calendar day's hour (00–23).
 */
export function kolkataHourToUtc(dateStr: string, hour: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day || hour < 0 || hour > 23) {
    throw new Error(`Invalid Kolkata slot: ${dateStr}T${hour}:00`);
  }
  return new Date(Date.UTC(year, month - 1, day, hour) - IST_OFFSET_MS);
}

/**
 * True when the instant is aligned to the hour in Asia/Kolkata.
 * Kolkata wall-clock 11:00 == UTC 05:30, so UTC minutes must be 30.
 */
export function isAlignedToKolkataHour(startsAt: Date): boolean {
  return (startsAt.getTime() + IST_OFFSET_MS) % SLOT_LENGTH_MS === 0;
}

/**
 * Booking window: strictly-future slots starting within the next N days.
 */
export function isWithinBookingWindow(startsAt: Date, now: Date, days: number): boolean {
  return (
    startsAt.getTime() > now.getTime() && startsAt.getTime() <= now.getTime() + days * 86_400_000
  );
}

export interface DaySlots {
  /** Kolkata calendar date, YYYY-MM-DD */
  date: string;
  slots: SlotView[];
}

export type SlotStatus = "free" | "booked" | "blocked";

export interface SlotView {
  /** UTC ISO instant of the start (clients render in Asia/Kolkata) */
  startsAt: string;
  /** UTC ISO instant of the end */
  endsAt: string;
  status: SlotStatus;
  isPast: boolean;
}

/** All Kolkata-hour alignments for a single weekday. */
export function slotsForDate(dateStr: string, now: Date): SlotView[] {
  const slots: SlotView[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const start = kolkataHourToUtc(dateStr, hour);
    slots.push({
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + SLOT_LENGTH_MS).toISOString(),
      status: "free",
      isPast: start.getTime() <= now.getTime(),
    });
  }
  return slots;
}

/**
 * Seven-day window of Kolkata dates, today (Kolkata) first.
 */
export function windowDates(now: Date, days = BOOKING_WINDOW_DAYS): string[] {
  const dates: string[] = [];
  let cursor = now;
  for (let i = 0; i < days; i++) {
    dates.push(kolkataDate(cursor));
    // advance a full Kolkata calendar day without IANA dependence:
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}
