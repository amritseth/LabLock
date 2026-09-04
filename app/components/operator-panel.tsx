"use client";

import { useState } from "react";
import type { AvailabilityPayload } from "@/lib/availability-service";
import { useAvailabilitySync } from "@/lib/use-availability-sync";
import { kolkataDayMonth, kolkataHour, kolkataRange, kolkataWeekday } from "@/lib/format-time";

interface Props {
  initial: AvailabilityPayload;
  bookings: Array<{
    id: string;
    user_id: string;
    starts_at: string;
    status: string;
    cancel_reason: string | null;
    created_at: string;
    resource_name: string;
  }>;
  audit: Array<{
    id: string;
    booking_id: string | null;
    action: string;
    request_id: string;
    metadata: unknown;
    created_at: string;
  }>;
  blocks: Array<{ id: string; starts_at: string; reason: string | null }>;
}

type Slot = AvailabilityPayload["days"][number]["slots"][number];

export function OperatorPanel({ initial, bookings, audit, blocks: initialBlocks }: Props) {
  const { data, refetch } = useAvailabilitySync(initial);
  const [selectedDay, setSelectedDay] = useState(data.days[0]?.date ?? "");
  const [pendingBlock, setPendingBlock] = useState<Slot | null>(null);
  const [reason, setReason] = useState("maintenance");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocks, setBlocks] = useState(initialBlocks);

  const day = data.days.find((d) => d.date === selectedDay) ?? data.days[0];

  async function createBlock() {
    if (!pendingBlock) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/slot-blocks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": crypto.randomUUID(),
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ startsAt: pendingBlock.startsAt, reason }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    setBusy(false);
    setPendingBlock(null);
    if (response?.ok) {
      setMessage(`Blocked ${kolkataRange(payload.startsAt)} IST — the slot cannot be booked.`);
      setBlocks((prev) => [...prev, { id: payload.blockId, starts_at: payload.startsAt, reason }]);
      void refetch();
    } else {
      setMessage(
        payload?.reason === "booking_exists"
          ? "A confirmed booking exists there — cancel it first."
          : "Block failed. Check the slot state.",
      );
    }
  }

  async function unblock(id: string) {
    setBusy(true);
    await fetch(`/api/slot-blocks/${id}`, {
      method: "DELETE",
      headers: { "x-idempotency-key": crypto.randomUUID(), "x-request-id": crypto.randomUUID() },
    }).catch(() => null);
    setBusy(false);
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setMessage("Unblocked — the slot is free again.");
    void refetch();
  }

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
        >
          {message}
        </p>
      )}

      <section aria-label="Block a slot" className="card p-4">
        <h2 className="text-sm font-bold text-slate-900">
          Block / unblock slots (maintenance, events)
        </h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {data.days.map((d) => (
            <button
              key={d.date}
              onClick={() => setSelectedDay(d.date)}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                d.date === day?.date
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {kolkataWeekday(d.date)} {kolkataDayMonth(d.date)}
            </button>
          ))}
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {day?.slots
            .filter((s) => !s.isPast)
            .map((slot) => (
              <li key={slot.startsAt}>
                <button
                  onClick={() => {
                    setPendingBlock(slot);
                    setMessage(null);
                  }}
                  disabled={slot.status === "booked"}
                  className={`w-full rounded-lg border px-1 py-2 text-xs font-semibold ${
                    slot.status === "booked"
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : slot.status === "blocked"
                        ? "cursor-not-allowed border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-red-400 hover:text-red-600"
                  }`}
                >
                  {kolkataHour(slot.startsAt)}
                </button>
              </li>
            ))}
        </ol>
        {pendingBlock && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="font-semibold text-slate-800">
              Block {kolkataRange(pendingBlock.startsAt)} IST
            </span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="reason (e.g. maintenance)"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={createBlock}
              disabled={busy || !reason.trim()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              {busy ? "Blocking…" : "Block"}
            </button>
            <button
              onClick={() => setPendingBlock(null)}
              className="text-xs font-semibold text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
        {blocks.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs"
              >
                <span className="text-slate-700">
                  <span className="font-semibold">{kolkataRange(b.starts_at)} IST</span> · blocked (
                  {b.reason ?? "no reason"})
                </span>
                <button
                  onClick={() => void unblock(b.id)}
                  disabled={busy}
                  className="font-semibold text-brand-600 hover:underline disabled:opacity-50"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="All bookings" className="card p-4">
        <h2 className="text-sm font-bold text-slate-900">All bookings (audit-backed)</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-xs">
          {bookings.slice(0, 12).map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <span className="font-mono text-slate-600">
                {b.user_id.slice(0, 8)}… · {new Date(b.starts_at).toISOString().slice(0, 16)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  b.status === "confirmed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {b.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Audit trail" className="card p-4">
        <h2 className="text-sm font-bold text-slate-900">Audit events (immutable)</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-xs font-mono text-slate-600">
          {audit.slice(0, 12).map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
              <span className="text-slate-400">{new Date(e.created_at).toISOString()}</span>
              <span className="font-bold text-slate-800">{e.action}</span>
              <span>booking={e.booking_id?.slice(0, 8) ?? "—"}</span>
              <span>req={e.request_id.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Every state-changing action is retained for dispute resolution: who cancelled what, when,
          with which request ID.
        </p>
      </section>
    </div>
  );
}
