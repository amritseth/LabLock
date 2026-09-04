"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailabilityPayload } from "@/lib/availability-service";

/**
 * Availability realtime sync — handbook §11 "Planned client algorithm".
 *
 * Realtime messages INVALIDATE; they do not apply. A message says "resource X
 * on date Y changed" and the client refetches the canonical view from
 * Postgres. Refetch is idempotent and safe to repeat.
 *
 * The seven steps:
 *   1. Snapshot      → initial server payload (passed as `initial`).
 *   2. Subscribe     → Realtime channel on availability_events.
 *   3. Refetch       → immediately after SUBSCRIBED (closes the
 *                       snapshot/subscription race — handbook Fig 11.2).
 *   4. Invalidate    → on every INSERT event → refetch.
 *   5. Reconnect     → on channel reconnect/error → refetch.
 *   6. Focus         → on tab focus / visibilitychange → refetch
 *                       (tab sleep = hours of missed events).
 *   7. Render        → state is always the last fetched canonical view.
 */
export function useAvailabilitySync(initial: AvailabilityPayload) {
  const [data, setData] = useState<AvailabilityPayload>(initial);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const response = await fetch(
        `/api/availability?resource=${encodeURIComponent(initial.resourceSlug)}`,
        {
          cache: "no-store",
        },
      );
      if (response.ok) {
        const payload: AvailabilityPayload = await response.json();
        setData(payload);
        setLastSyncAt(new Date());
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [initial.resourceSlug]);

  useEffect(() => {
    let channel: { unsubscribe: () => void } | null = null;
    let cancelled = false;

    async function setup() {
      // Step 2 — subscribe. The browser Supabase client uses the anon key +
      // RLS: availability_events rows are readable by authenticated users
      // only, and they are PII-free by schema (handbook §8).
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowserClient();
      if (cancelled) return;

      channel = supabase
        .channel("availability-events")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "availability_events",
            filter: `resource_id=eq.${initial.resourceId}`,
          },
          () => {
            // Step 4 — invalidate, then refetch. Never apply the payload.
            void refetch();
          },
        )
        .subscribe((status) => {
          // Step 3 — refetch after subscribe; Step 5 — reconnect convergence.
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void refetch();
          }
        });
    }

    void setup();

    // Step 6 — refetch on focus (covers tab sleep and missed events).
    const onFocus = () => void refetch();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.unsubscribe();
    };
  }, [initial.resourceId, refetch]);

  return {
    data,
    syncing,
    lastSyncAt,
    refetch,
    refreshNonce,
    bumpRefresh: () => setRefreshNonce((n) => n + 1),
  };
}
