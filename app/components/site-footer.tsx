import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-700">LabLock v0.1.0 — pilot build</p>
          <p className="mt-1 max-w-md text-xs">
            One Postgres-backed schedule decides who gets a slot — not a chat, spreadsheet, or
            WebSocket. Occupancy is public; booker identity is private.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-900">
            Pilot terms
          </Link>
          <Link href="/changelog" className="hover:text-slate-900">
            Changelog
          </Link>
          <a href="/api/health" className="hover:text-slate-900">
            Health
          </a>
        </nav>
      </div>
    </footer>
  );
}
