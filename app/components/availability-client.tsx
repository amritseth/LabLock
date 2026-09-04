"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailabilityPayload } from "@/lib/availability-service";
import { useAvailabilitySync } from "@/lib/use-availability-sync";
import {
  kolkataDayMonth,
  kolkataHour,
  kolkataRange,
  kolkataToday,
  kolkataWeekday,
  isToday,
} from "@/lib/format-time";
import { capture } from "@/lib/analytics";

export interface MyBookingRow {
  id: string;
  starts_at: string;
  status: "confirmed" | "cancelled";
  cancel_reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  resource_name: string;
}

interface Props {
  initial: AvailabilityPayload;
  myBookings: MyBookingRow[];
  displayName: string;
  role: string;
}

type Slot = AvailabilityPayload["days"][number]["slots"][number];

export function AvailabilityClient({ initial, myBookings, displayName, role }: Props) {
  const { data, syncing, lastSyncAt, refetch } = useAvailabilitySync(initial);
  const [selectedDay, setSelectedDay] = useState<string>(data.days[0]?.date ?? "");
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState<{
    state: "idle" | "busy";
    message?: string;
    ok?: boolean;
  }>({ state: "idle" });
  const [bookings, setBookings] = useState<MyBookingRow[]>(myBookings);
  const keys = useRef(new Map<string, string>());

  const day = data.days.find((d) => d.date === selectedDay) ?? data.days[0];
  const keyFor = useCallback((slotKey: string) => {
    let key = keys.current.get(slotKey);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(slotKey, key);
    }
    return key;
  }, []);

  // §15.1 — availability_viewed fires once per page view. Allowed props:
  // resource_id, date (no user_id, no email).
  useEffect(() => {
    capture("availability_viewed", { resource_id: initial.resourceSlug, date: kolkataToday() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMyBookings() {
    const response = await fetch("/api/bookings?mine=1", { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json();
      if (payload.bookings) setBookings(payload.bookings as MyBookingRow[]);
    }
  }

  async function confirmBooking() {
    if (!pendingSlot) return;
    capture("booking_started", {
      resource_id: initial.resourceSlug,
      starts_at: pendingSlot.startsAt,
    });
    const started = Date.now();
    setBooking({ state: "busy", message: "Talking to the database…" });
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": keyFor(`book:${pendingSlot.startsAt}`),
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ startsAt: pendingSlot.startsAt }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (response?.ok && payload?.status === "confirmed") {
      capture("booking_succeeded", {
        resource_id: initial.resourceSlug,
        starts_at: payload.startsAt,
        duration_ms: Date.now() - started,
      });
      setBooking({
        state: "idle",
        ok: true,
        message: "Confirmed — the database recorded your slot.",
      });
      setPendingSlot(null);
      void refetch();
      void fetchMyBookings();
      return;
    }
    capture("booking_failed", {
      resource_id: initial.resourceSlug,
      starts_at: pendingSlot.startsAt,
      reason_code: payload?.reason ?? "request_failed",
    });
    setBooking({
      state: "idle",
      ok: false,
      message:
        payload?.reason === "slot_already_confirmed"
          ? "Someone just booked this slot. The schedule below has been refreshed."
          : (payload?.reason ?? "The booking was not recorded. Please try again."),
    });
    setPendingSlot(null);
    void refetch();
  }

  async function cancelBooking(id: string, startsAt: string) {
    capture("booking_cancelled", {
      resource_id: initial.resourceSlug,
      starts_at: startsAt,
      actor_role: role,
    });
    setBooking({ state: "busy", message: "Cancelling…" });
    await fetch(`/api/bookings/${id}?reason=pilot_cancellation`, {
      method: "DELETE",
      headers: { "x-idempotency-key": crypto.randomUUID(), "x-request-id": crypto.randomUUID() },
    }).catch(() => null);
    setBooking({ state: "idle", ok: true, message: "Cancelled — the slot is free again." });
    void refetch();
    void fetchMyBookings();
  }

  // "Upcoming" is a wall-clock view: recompute in an effect (never during
  // render), refreshing each minute so a just-passed slot drops off.
  const [upcoming, setUpcoming] = useState<MyBookingRow[]>([]);
  useEffect(() => {
    const compute = () =>
      setUpcoming(
        bookings
          .filter((b) => b.status === "confirmed" && new Date(b.starts_at).getTime() > Date.now())
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      );
    compute();
    const timer = setInterval(compute, 60_000);
    return () => clearInterval(timer);
  }, [bookings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-600">
          Signed in as{" "}
          <span className="font-semibold text-slate-900">{displayName || "pilot member"}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-xs text-slate-400">role: {role}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${syncing ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`}
          />
          {syncing
            ? "syncing…"
            : lastSyncAt
              ? `live · synced ${lastSyncAt.toLocaleTimeString("en-IN")}`
              : "live"}
        </p>
      </div>

      {booking.message && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            booking.ok
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {booking.message}
        </div>
      )}

      <section aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-1">
        {data.days.map((d) => (
          <button
            key={d.date}
            onClick={() => setSelectedDay(d.date)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-left transition ${
              d.date === day?.date
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand-300"
            }`}
          >
            <span className="block text-xs font-medium opacity-80">
              {isToday(d.date) ? "Today" : kolkataWeekday(d.date)}
            </span>
            <span className="block text-sm font-bold">{kolkataDayMonth(d.date)}</span>
          </button>
        ))}
      </section>

      <section aria-label="Slots" className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            {day
              ? `${isToday(day.date) ? "Today" : kolkataWeekday(day.date)} · ${kolkataDayMonth(day.date)} — 24 one-hour slots`
              : ""}
          </h2>
          <p className="text-xs text-slate-400">Asia/Kolkata · one lab</p>
        </div>
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {day?.slots.map((slot) => {
            const label = kolkataHour(slot.startsAt);
            const disabled = slot.isPast || slot.status !== "free";
            return (
              <li key={slot.startsAt}>
                <button
                  data-testid={`slot-${slot.startsAt}`}
                  data-status={slot.isPast ? "past" : slot.status}
                  disabled={disabled}
                  onClick={() => {
                    setPendingSlot(slot);
                    setBooking({ state: "idle" });
                  }}
                  className={`w-full rounded-lg border px-2 py-2.5 text-center transition ${
                    slot.status === "booked"
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : slot.status === "blocked"
                        ? "cursor-not-allowed border-slate-200 bg-slate-900 text-slate-300"
                        : slot.isPast
                          ? "cursor-not-allowed border-slate-100 text-slate-300"
                          : "border-brand-200 bg-brand-50 font-semibold text-brand-700 hover:bg-brand-100"
                  }`}
                >
                  <span className="block text-sm">{label}</span>
                  <span className="block text-[10px] font-medium tracking-wide uppercase opacity-70">
                    {slot.isPast ? "past" : slot.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          Occupancy only — other students never see who booked. Booker identity is private; the
          audit log records every change.
        </p>
      </section>

      {pendingSlot && (
        <section aria-label="Confirm booking" className="card border-brand-300 p-4">
          <h2 className="text-sm font-bold text-slate-900">Confirm this slot?</h2>
          <p className="mt-1 text-sm text-slate-600">
            {kolkataWeekday(day!.date)} · {kolkataRange(pendingSlot.startsAt)} IST — the database
            decides, not the chat.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              data-testid="confirm-booking"
              onClick={confirmBooking}
              disabled={booking.state === "busy"}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {booking.state === "busy" ? "Booking…" : "Book this slot"}
            </button>
            <button
              onClick={() => setPendingSlot(null)}
              disabled={booking.state === "busy"}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Not now
            </button>
          </div>
        </section>
      )}

      <section aria-label="Your bookings" className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Your bookings</h2>
          <button
            onClick={() => void fetchMyBookings()}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Refresh
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No upcoming bookings. Tap a free slot above — it takes under 20 seconds.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {upcoming.map((b) => (
              <li
                key={b.id}
                data-testid={`booking-${b.id}`}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }).format(new Date(b.starts_at))}{" "}
                    · {kolkataRange(b.starts_at)} IST
                  </p>
                  <p className="text-xs text-slate-400">{b.resource_name}</p>
                </div>
                <button
                  onClick={() => void cancelBooking(b.id, b.starts_at)}
                  disabled={booking.state === "busy"}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
