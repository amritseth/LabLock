import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Pilot terms — LabLock",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">LabLock pilot</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Pilot terms</h1>
        <p className="mt-1 text-sm text-slate-500">v1 · pilot cohort · last updated 13 July 2026</p>

        <div className="mt-8 space-y-6 text-sm text-slate-700">
          <section>
            <h2 className="text-base font-bold text-slate-900">1. What this is</h2>
            <p>
              A pilot reservation schedule for one shared project lab. Its purpose is to remove
              double bookings and the “is it free?” chase. It is not a commercial service, and it is
              provided to a small invited cohort.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">2. The rule that matters</h2>
            <p>
              At most one confirmed booking may exist for a resource and start time. The database
              enforces this — if two people tap the same slot, exactly one wins and the other is
              told immediately. Confirmation appears only after the database commits.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">3. Your responsibilities</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Book only what you will use; cancel promptly when plans change.</li>
              <li>
                Use your verified college account; never share your session with someone else.
              </li>
              <li>
                Do not script or automate bookings, or attempt to book slots that are blocked.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">4. Operator powers</h2>
            <p>
              The operator can block slots (maintenance, events) and cancel invalid bookings. Every
              such action is written to an immutable audit log with a request id, so “who cancelled
              what, when” is always answerable.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">5. Availability</h2>
            <p>
              The pilot may pause, change or end at any time with a note in the changelog. Blocked
              slots are non-bookable; the operator decides what counts as maintenance.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">6. Disputes</h2>
            <p>
              If you believe the schedule shows a double booking, do not edit anything yourself —
              contact the operator. The preserved audit trail and unique-index invariant are used to
              verify rather than guess.
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-slate-500">
          See our{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            privacy notice
          </Link>{" "}
          for what we store.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
