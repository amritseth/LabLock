import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy — LabLock",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">LabLock pilot</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Privacy notice</h1>
        <p className="mt-1 text-sm text-slate-500">v1 · pilot cohort · last updated 13 July 2026</p>

        <div className="prose-sm mt-8 space-y-6 text-sm text-slate-700">
          <section>
            <h2 className="text-base font-bold text-slate-900">Who runs this pilot</h2>
            <p>
              LabLock is a pilot operated by the project-lab coordinator (the “operator”) at our
              institution. Contact for privacy matters:{" "}
              <span className="font-mono">
                operator contact &lt;to be confirmed before pilot&gt;
              </span>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">What we store</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Account</strong> — your name and verified email, stored in Supabase Auth and
                mirrored in a<code className="rounded bg-slate-100 px-1">profiles</code> row.
              </li>
              <li>
                <strong>Bookings</strong> — which slot you reserved, when it was created and
                cancelled (one row per booking, the source of truth).
              </li>
              <li>
                <strong>Audit events</strong> — an immutable record of every state-changing action,
                retained at least one year for dispute resolution. It stores a hashed reference
                instead of your raw identity.
              </li>
              <li>
                <strong>Availability events</strong> — a PII-free broadcast of slot state (free /
                booked / blocked), retained 7 days. It contains no user id and no email.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">What we do not store or show</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                We never show your identity to other students — occupancy is public, booker identity
                is private.
              </li>
              <li>We do not track attendance, cameras, or lab entry.</li>
              <li>
                No behavioural profile is built; analytics (Slice D) will exclude email, names and
                booking ids.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Retention and deletion</h2>
            <p>
              Availability events: 7 days rolling. Idempotency records: 30 days, then archived.
              Audit events: one year minimum (90 days hot, then cold). Booking rows: kept for the
              pilot so disputes stay resolvable — deleting your account deletes your bookings and
              cascades to audit references.
            </p>
            <p className="mt-2">
              To exercise access or deletion rights, contact the operator; expect confirmation
              within 72 hours.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Security</h2>
            <p>
              Sessions are httpOnly cookies (never localStorage). Row-level security restricts every
              table; the service-role key never reaches the browser. Logs redact tokens, passwords,
              cookies, emails and keys before they are written.
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-slate-500">
          See also our{" "}
          <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
            pilot terms
          </Link>{" "}
          and{" "}
          <Link href="/changelog" className="font-semibold text-brand-600 hover:underline">
            changelog
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
