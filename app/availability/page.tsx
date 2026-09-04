import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";
import { AvailabilityClient, type MyBookingRow } from "@/app/components/availability-client";
import { getSessionActor } from "@/lib/supabase/server";
import { loadAvailability } from "@/lib/availability-service";
import { listMyBookings } from "@/lib/bookings";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Availability — LabLock",
};

// Serves per-user content (session cookies) — never static.
export const dynamic = "force-dynamic";

/**
 * GET /availability — the one core action screen (handbook §4):
 * see a free one-hour slot and confirm it.
 * Server-rendered snapshot first; the client then runs the seven-step
 * subscribe → refetch → invalidate convergence algorithm (§11).
 */
export default async function AvailabilityPage() {
  const actor = await getSessionActor();
  if (!actor) redirect(`/login`);

  if (!isSupabaseConfigured() || !process.env.SUPABASE_DB_URL) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="card p-6">
            <h1 className="text-xl font-bold text-slate-900">
              Booking is implemented — not yet connected
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              The booking and realtime slices are fully implemented, but they need a Supabase
              project plus the
              <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
              <code className="rounded bg-slate-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
              <code className="rounded bg-slate-100 px-1">SUPABASE_DB_URL</code> environment
              variables (see .env.example). Until then, this page refuses to guess.
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const initial = await loadAvailability();
  if (!initial) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="card p-6">
            <h1 className="text-xl font-bold text-slate-900">Resource not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              The <code>project-lab</code> resource is missing. Run the migrations and seed (README
              §Setup) and reload.
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const bookings = (await listMyBookings({
    userId: actor.userId,
    role: actor.role,
  })) as MyBookingRow[];

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">
            Live schedule · next 7 days
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Book the lab</h1>
          <p className="text-sm text-slate-500">
            One-hour slots, Asia/Kolkata. Occupancy is public; booker identity is private.
          </p>
        </div>
        <AvailabilityClient
          initial={initial}
          myBookings={bookings}
          displayName={actor.email ?? ""}
          role={actor.role}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
