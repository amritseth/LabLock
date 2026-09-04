import { describe, expect, it } from "vitest";
import {
  buildAvailabilityView,
  checkBookingRules,
  canonicalBookingPayload,
  type AvailabilitySource,
} from "./availability";
import { kolkataHourToUtc } from "./slots";

/**
 * Unit tests for the occupancy view-builder and the booking rule checks.
 * The view contains NO booker identity by construction — the source only
 * carries start instants.
 */

describe("buildAvailabilityView", () => {
  const now = new Date("2026-07-13T03:00:00.000Z"); // 08:30 IST Jul 13

  const source: AvailabilitySource = {
    confirmedStarts: [kolkataHourToUtc("2026-07-13", 11).toISOString()],
    blockedStarts: [kolkataHourToUtc("2026-07-13", 14).toISOString()],
  };

  it("marks confirmed and blocked starts and leaves others free", () => {
    const view = buildAvailabilityView(source, now, 1);
    expect(view).toHaveLength(1);
    const slots = view[0]!.slots;
    expect(
      slots.find((s) => s.startsAt === kolkataHourToUtc("2026-07-13", 11).toISOString())!.status,
    ).toBe("booked");
    expect(
      slots.find((s) => s.startsAt === kolkataHourToUtc("2026-07-13", 14).toISOString())!.status,
    ).toBe("blocked");
    expect(
      slots.find((s) => s.startsAt === kolkataHourToUtc("2026-07-13", 12).toISOString())!.status,
    ).toBe("free");
  });

  it("never contains booker identity fields", () => {
    const view = buildAvailabilityView(source, now, 1);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/user_id|userId|email|bookingId/);
  });

  it("builds a 7-day view by default", () => {
    const view = buildAvailabilityView({ confirmedStarts: [], blockedStarts: [] }, now);
    expect(view).toHaveLength(7);
    expect(view.every((d) => d.slots.length === 24)).toBe(true);
  });
});

describe("checkBookingRules", () => {
  const now = new Date("2026-07-13T03:00:00.000Z");

  it("accepts an aligned future slot inside the window", () => {
    const startsAt = kolkataHourToUtc("2026-07-14", 11);
    expect(checkBookingRules(startsAt, now, 7)).toEqual({ ok: true });
  });

  it("rejects unaligned slots", () => {
    const startsAt = new Date(kolkataHourToUtc("2026-07-14", 11).getTime() + 45 * 60 * 1000);
    expect(checkBookingRules(startsAt, now, 7).reason).toBe("invalid_alignment");
  });

  it("rejects past slots (aligned instants only — alignment is checked first)", () => {
    // now = 08:30 IST Jul 13; 08:00 IST today is aligned but already past.
    const startsAt = kolkataHourToUtc("2026-07-13", 8);
    expect(startsAt.getTime()).toBeLessThan(now.getTime());
    expect(checkBookingRules(startsAt, now, 7).reason).toBe("slot_in_past");
  });

  it("rejects slots outside the window (aligned instants first)", () => {
    const startsAt = kolkataHourToUtc("2026-07-21", 12); // 8 days ahead
    expect(checkBookingRules(startsAt, now, 7).reason).toBe("outside_window");
  });
});

describe("canonicalBookingPayload", () => {
  it("is deterministic for the same logical request", () => {
    expect(canonicalBookingPayload("project-lab", "2026-07-14T05:30:00.000Z")).toBe(
      canonicalBookingPayload("project-lab", "2026-07-14T05:30:00.000Z"),
    );
  });

  it("differs when the resource or slot changes (idempotency key binding)", () => {
    const base = canonicalBookingPayload("project-lab", "2026-07-14T05:30:00.000Z");
    expect(canonicalBookingPayload("project-lab", "2026-07-14T06:30:00.000Z")).not.toBe(base);
    expect(canonicalBookingPayload("other-lab", "2026-07-14T05:30:00.000Z")).not.toBe(base);
  });
});
