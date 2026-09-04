import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Changelog — LabLock",
};

const ENTRIES = [
  {
    date: "2026-07-13",
    title: "Slice A · Deployment skeleton (locally verified)",
    items: [
      "Landing page, login placeholder, privacy/terms/changelog pages",
      "Sanitized, fail-closed /api/health with 2s probe, x-request-id, no-store",
      "Pino structured logger with PII redaction; Sentry integration points (DSN blank)",
      "Security headers (CSP, HSTS, COOP, X-Frame-Options DENY, …) in next.config.ts",
      "Supabase migration: healthcheck() RPC — security definer, service_role only",
      "CI + gated deploy workflows (pinned actions by SHA, frozen lockfile)",
      "Docs: README, METRICS, NOTES, RUNBOOK, SECURITY, CHANGELOG",
    ],
  },
  {
    date: "2026-07-14",
    title: "Slice B · Auth + core booking (implemented)",
    items: [
      "profiles, resources, bookings, slot_blocks, idempotency_records, audit_events, availability_events migrations",
      "Partial unique index bookings_one_confirmed_per_slot — the correctness wall",
      "Ten-step booking transaction: idempotency claim → rules → insert → audit → event → response → commit",
      "Cancel own (student) / any (operator); operator block & unblock; audit trail endpoint",
      "Role-based auth (student / operator) via Supabase sessions + profiles; RLS on every table",
    ],
  },
  {
    date: "2026-07-15",
    title: "Slice C · Real-time synchronization (implemented)",
    items: [
      "Supabase Realtime publication on availability_events (PII-free payloads)",
      "Client algorithm: snapshot → subscribe → refetch → invalidate → refetch on reconnect → refetch on focus",
      "Occupancy-only availability API; booker identity never leaves the server",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">LabLock</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Changelog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every user-visible change, with honest status.
        </p>

        <ol className="mt-8 space-y-8">
          {ENTRIES.map((entry) => (
            <li key={entry.date} className="relative border-l-2 border-slate-200 pl-6">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" />
              <p className="text-xs font-bold tracking-wide text-slate-400">{entry.date}</p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">{entry.title}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          Nothing here is deployed yet: the changelog describes what exists in the repository and
          what has been verified locally. The first production release is recorded here only after
          it happens. See{" "}
          <Link href="/api/health" className="font-semibold text-brand-600 hover:underline">
            /api/health
          </Link>{" "}
          for the live release id.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
