import { SiteHeader } from "@/app/components/site-header";
import { SiteFooter } from "@/app/components/site-footer";
import { HeroCta } from "@/app/components/hero-cta";
import { getSessionActor } from "@/lib/supabase/server";

/**
 * Landing page (handbook §7: GET / → app/page.tsx, static + demo slot data).
 * The demo strip is clearly labeled — live availability lives at /availability.
 */

// The CTA depends on the session — render per request, not static.
export const dynamic = "force-dynamic";

const DEMO_SLOTS = [
  { time: "09:00", status: "booked" },
  { time: "10:00", status: "free" },
  { time: "11:00", status: "free" },
  { time: "12:00", status: "blocked" },
  { time: "14:00", status: "free" },
  { time: "15:00", status: "booked" },
  { time: "16:00", status: "free" },
];

const PROBLEMS = [
  {
    title: "Paper register lives in the lab",
    text: "You cannot check from anywhere, and it is out of date by the afternoon. One Postgres-backed schedule is visible from any browser.",
  },
  {
    title: "Excel is one person's file",
    text: "Multiple versions, merge conflicts, no audit trail. One row per booking, and a partial unique constraint prevents doubles.",
  },
  {
    title: "WhatsApp groups fragment the answer",
    text: "Three different replies to 'is it free?'. Availability is a database view — chat is not a source of truth.",
  },
  {
    title: "No record of who cancelled",
    text: "Disputes are unresolvable. Every state-changing action writes an immutable audit event, retained for disputes.",
  },
];

export default async function HomePage() {
  const actor = await getSessionActor();

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <section className="bg-ink-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <p className="text-xs font-bold tracking-[0.2em] text-brand-300 uppercase">
            One trusted schedule for the project lab
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-black tracking-tight sm:text-6xl">
            Book the lab. <span className="text-brand-300">Skip the WhatsApp chase.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            Open the link, see a free one-hour slot, tap book — and the database, not a chat,
            confirms it is yours. Returning booking in under 20 seconds.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <HeroCta signedIn={Boolean(actor)} />
            <a
              href="#how"
              className="rounded-xl border border-slate-600 px-6 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
            >
              How it works
            </a>
          </div>

          <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Demo data · sample week
              </p>
              <p className="text-xs text-slate-500">Sign in to see the live 7-day schedule</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DEMO_SLOTS.map((slot) => (
                <div
                  key={slot.time}
                  className={`rounded-lg px-2 py-3 text-center ${
                    slot.status === "free"
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40"
                      : slot.status === "booked"
                        ? "bg-white/10 text-slate-300 ring-1 ring-white/15"
                        : "bg-red-500/15 text-red-300 ring-1 ring-red-400/40"
                  }`}
                >
                  <p className="text-sm font-bold">{slot.time}</p>
                  <p className="text-[10px] tracking-widest uppercase opacity-80">{slot.status}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">
          The problem is weekly, not theoretical
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Twelve final-year project students, four club coordinators, four class representatives and
          one operator coordinate one shared lab through paper, Excel and three WhatsApp groups.
          Double bookings happen, and nobody trusts the schedule.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="card p-5">
              <p className="font-bold text-slate-900">{p.title}</p>
              <p className="mt-1.5 text-sm text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Product rules (v1)</h2>
          <ul className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            {[
              "One lab, one resource — one-hour slots, aligned to the hour.",
              "Booking window: the next seven days, Asia/Kolkata.",
              "Invite-only pilot accounts; signup closed except for the allowlist.",
              "Students book and cancel their own future slots only.",
              "Everyone sees occupancy — nobody sees who booked.",
              "One manually-assigned operator can block a slot or cancel any invalid booking.",
              "No team model, approval workflow, quota, or waitlist in v1.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-0.5 text-brand-600">✓</span>
                {rule}
              </li>
            ))}
          </ul>

          <h2 className="mt-12 text-2xl font-black tracking-tight text-slate-900">
            Status — honest and current
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Component</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                <tr>
                  <td className="px-4 py-2.5">
                    Slice A — deployment skeleton (landing, health, logs, CI, docs)
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      [✓] IMPLEMENTED · LOCALLY VERIFIED
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Slice B — auth + core booking (this repo implements it)
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      [✓] IMPLEMENTED · LOCALLY VERIFIED
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Slice C — realtime invalidation + refetch convergence
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      [✓] IMPLEMENTED · LOCALLY VERIFIED
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    Production deployment, live URL, managed backups, production monitoring, real
                    users
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      [!] NOT YET VERIFIED / DEPLOYED
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Slice A is locally verified but is NOT considered shipped until external deployment,
            monitoring, database backups and the live URL are verified. No real users, no live URL,
            no production backups, no production monitoring exists today.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
