import Link from "next/link";

import { FounderAccountPanel } from "@/features/account";
import { BillingStatusPanel } from "@/features/billing";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Settings</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Founder profile and plan</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Maintain founder context, active sessions, and billing controls in a focused view.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            href="/"
          >
            Back to console
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <FounderAccountPanel />
          <BillingStatusPanel />
        </div>
      </div>
    </main>
  );
}
