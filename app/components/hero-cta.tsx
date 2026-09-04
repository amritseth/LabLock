"use client";

import Link from "next/link";
import { capture } from "@/lib/analytics";

/**
 * Landing CTA — fires landing_cta_clicked (allowed prop: source) before
 * navigating. PII-free by taxonomy; no-op when PostHog is unconfigured.
 */
export function HeroCta({ signedIn }: { signedIn: boolean }) {
  return (
    <Link
      href={signedIn ? "/availability" : "/login"}
      onClick={() => capture("landing_cta_clicked", { source: "hero" })}
      className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-400"
    >
      {signedIn ? "Open live availability →" : "Join the pilot"}
    </Link>
  );
}
