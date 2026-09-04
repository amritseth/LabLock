"use client";

/**
 * Client-side formatting. All times are Asia/Kolkata, matching the product
 * rule 'Booking window: next seven days, Asia/Kolkata'. Delivery is from
 * UTC instants; the IANA zone is rendered with Intl (no DST in IST).
 */
export const KOLKATA_TZ = "Asia/Kolkata";

export function kolkataHour(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: KOLKATA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function kolkataRange(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 3_600_000);
  return `${kolkataHour(iso)}–${kolkataHour(end.toISOString())}`;
}

export function kolkataWeekday(dateStr: string): string {
  // dateStr is YYYY-MM-DD (Kolkata calendar day) → render in UTC+0 to avoid
  // off-by-one from the +05:30 offset.
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

export function kolkataDayMonth(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

export function isToday(dateStr: string): boolean {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return dateStr === today;
}
