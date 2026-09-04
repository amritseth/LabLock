import { describe, expect, it } from "vitest";
import {
  BOOKING_WINDOW_DAYS,
  IST_OFFSET_MS,
  SLOT_LENGTH_MS,
  isAlignedToKolkataHour,
  isWithinBookingWindow,
  kolkataDate,
  kolkataHourToUtc,
  slotsForDate,
  windowDates,
} from "./slots";

/**
 * Unit tests for the v1 slot rules (handbook §4):
 * one-hour slots aligned to the hour, window = next 7 days, Asia/Kolkata.
 * Asia/Kolkata is UTC+05:30 with no DST, so all expectations are exact.
 */

describe("kolkataHourToUtc", () => {
  it("maps 00:00 IST to the previous day 18:30 UTC", () => {
    expect(kolkataHourToUtc("2026-07-14", 0).toISOString()).toBe("2026-07-13T18:30:00.000Z");
  });

  it("maps 11:00 IST to 05:30 UTC (the handbook example slot)", () => {
    expect(kolkataHourToUtc("2026-07-14", 11).toISOString()).toBe("2026-07-14T05:30:00.000Z");
  });

  it("round-trips through kolkataDate", () => {
    const slot = kolkataHourToUtc("2026-07-14", 11);
    expect(kolkataDate(slot)).toBe("2026-07-14");
  });
});

describe("isAlignedToKolkataHour", () => {
  it("accepts Kolkata-hour-aligned instants", () => {
    expect(isAlignedToKolkataHour(kolkataHourToUtc("2026-07-14", 11))).toBe(true);
    expect(isAlignedToKolkataHour(kolkataHourToUtc("2026-07-14", 23))).toBe(true);
  });

  it("rejects half-hour offsets", () => {
    const slot = new Date(kolkataHourToUtc("2026-07-14", 11).getTime() + 30 * 60 * 1000);
    expect(isAlignedToKolkataHour(slot)).toBe(false);
  });
});

describe("isWithinBookingWindow", () => {
  const now = new Date("2026-07-13T10:00:00.000Z");

  it("accepts today-tomorrow slots in the future", () => {
    const tomorrow = kolkataHourToUtc("2026-07-14", 11);
    expect(isWithinBookingWindow(tomorrow, now, BOOKING_WINDOW_DAYS)).toBe(true);
  });

  it("rejects past instants even when inside the 7-day span", () => {
    const earlierToday = new Date(now.getTime() - 3_600_000);
    expect(isWithinBookingWindow(earlierToday, now, BOOKING_WINDOW_DAYS)).toBe(false);
  });

  it("rejects slots beyond 7 days", () => {
    const far = new Date(now.getTime() + 8 * 86_400_000);
    expect(isWithinBookingWindow(far, now, BOOKING_WINDOW_DAYS)).toBe(false);
  });

  it("accepts the exact 7-day boundary", () => {
    const edge = new Date(now.getTime() + 7 * 86_400_000);
    expect(isWithinBookingWindow(edge, now, BOOKING_WINDOW_DAYS)).toBe(true);
  });
});

describe("slotsForDate", () => {
  it("emits 24 one-hour slots for a Kolkata date", () => {
    const slots = slotsForDate("2026-07-14", new Date("2026-07-13T00:00:00.000Z"));
    expect(slots).toHaveLength(24);
    const first = slots[0]!;
    const last = slots[23]!;
    expect(first.startsAt).toBe("2026-07-13T18:30:00.000Z");
    expect(last.startsAt).toBe("2026-07-14T17:30:00.000Z");
    for (const slot of slots) {
      const start = new Date(slot.startsAt);
      const end = new Date(slot.endsAt);
      expect(end.getTime() - start.getTime()).toBe(SLOT_LENGTH_MS);
    }
  });

  it("marks past slots relative to now (boundary is past — bookings need strictly-future slots)", () => {
    const now = kolkataHourToUtc("2026-07-14", 10);
    const slots = slotsForDate("2026-07-14", now);
    expect(slots[9]!.isPast).toBe(true); // 09:00 IST < now
    expect(slots[10]!.isPast).toBe(true); // 10:00 IST == now → cannot be booked
    expect(slots[10]!.startsAt).toBe(now.toISOString());
    expect(slots[11]!.isPast).toBe(false); // 11:00 IST > now
  });
});

describe("windowDates", () => {
  it("returns 7 Kolkata dates starting today (Kolkata)", () => {
    const now = new Date("2026-07-13T20:00:00.000Z"); // 01:30 IST on Jul 14
    const dates = windowDates(now, 7);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-07-14"); // Kolkata "today", not UTC today
    expect(dates[6]).toBe("2026-07-20");
    expect(new Set(dates).size).toBe(7);
  });

  it("uses the IST offset constant consistently", () => {
    expect(IST_OFFSET_MS).toBe((5 * 60 + 30) * 60 * 1000);
  });
});
