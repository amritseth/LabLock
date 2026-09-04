import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";
import { OperatorPanel } from "@/app/components/operator-panel";
import { getSessionActor } from "@/lib/supabase/server";
import { loadAvailability } from "@/lib/availability-service";
import { listAuditEvents, listBlocks, listMyBookings } from "@/lib/admin-service";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Operator — LabLock",
};

// Serves per-user content (session cookies + operator role) — never static.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const actor = await getSessionActor();
  if (!actor) redirect(`/login`);
  if (actor.role !== "operator") redirect(`/availability`);

  if (!isSupabaseConfigured() || !process.env.SUPABASE_DB_URL) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="card p-6">
            <h1 className="text-xl font-bold text-slate-900">
              Operator console — needs a connected Supabase project
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Set the Supabase environment variables (see .env.example) and apply the migrations to
              enable the operator console.
            </p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const initial = await loadAvailability();
  const bookings = await listMyBookings({ userId: actor.userId, role: actor.role });
  const audit = await listAuditEvents({ userId: actor.userId, role: actor.role });
  const blocks = await listBlocks();

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Operator</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Lab control</h1>
          <p className="text-sm text-slate-500">
            Block slots for maintenance, cancel invalid bookings, and read the immutable audit
            trail. Every action you take here is recorded.
          </p>
        </div>
        {initial ? (
          <OperatorPanel
            initial={initial}
            bookings={bookings as never[]}
            audit={audit as never[]}
            blocks={blocks}
          />
        ) : (
          <div className="card p-6 text-sm text-slate-600">
            Resource not found — run migrations + seed first.
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
