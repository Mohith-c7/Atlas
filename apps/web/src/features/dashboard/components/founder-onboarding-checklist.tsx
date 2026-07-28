"use client";

import { cn } from "@faios/ui";
import Link from "next/link";
import { useMemo } from "react";

import { useFounderAccount } from "@/features/account/hooks/use-founder-account";
import { useBillingStatus } from "@/features/billing/hooks/use-billing-status";
import { useCommandExecutions } from "@/features/executions/hooks/use-command-executions";
import { useIntegrationConnections } from "@/features/integrations/hooks/use-integration-connections";
import { useMemoryItems } from "@/features/memory/hooks/use-memory-items";
import { useOnlineStatus } from "@/lib/use-online-status";

type ChecklistItem = {
  readonly actionHref: "#command-center" | "#integrations" | "#memory" | "#settings" | "/billing";
  readonly actionLabel: string;
  readonly complete: boolean;
  readonly description: string;
  readonly label: string;
};

function getFirstError(errors: readonly unknown[]) {
  const error = errors.find(Boolean);

  if (error instanceof Error) {
    return error.message;
  }

  return error ? "Unable to load setup progress." : undefined;
}

function ChecklistRow({ item }: Readonly<{ item: ChecklistItem }>) {
  const actionClassName =
    "inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary focus:outline-none focus:ring-4 focus:ring-primary/10";

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            item.complete
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-accent/25 bg-accent/10 text-accent",
          )}
        >
          {item.complete ? "OK" : "!"}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{item.label}</p>
          <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
        </div>
      </div>
      {item.actionHref === "/billing" ? (
        <Link className={actionClassName} href="/billing">
          {item.actionLabel}
        </Link>
      ) : (
        <a className={actionClassName} href={item.actionHref}>
          {item.actionLabel}
        </a>
      )}
    </li>
  );
}

export function FounderOnboardingChecklist() {
  const account = useFounderAccount();
  const integrations = useIntegrationConnections();
  const memories = useMemoryItems();
  const executions = useCommandExecutions();
  const billing = useBillingStatus();
  const isOnline = useOnlineStatus();

  const checklist = useMemo<ChecklistItem[]>(() => {
    const founderHasProfile = Boolean(
      account.data?.account.displayName ||
      account.data?.account.companyProfile.name ||
      account.data?.account.profile.timezone,
    );
    const hasConnectedTool = Boolean(
      integrations.data?.connections.some((connection) => connection.status === "connected"),
    );
    const hasMemory = Boolean(
      memories.data?.memories.some((memory) => !memory.archivedAt && !memory.deletedAt),
    );
    const hasCommand = Boolean(executions.data?.executions.length);
    const hasBillingStatus = Boolean(billing.data?.billing.status);

    return [
      {
        actionHref: "#settings",
        actionLabel: founderHasProfile ? "Review" : "Add context",
        complete: founderHasProfile,
        description: "Add founder, timezone, and company context for better planning.",
        label: "Set founder context",
      },
      {
        actionHref: "#integrations",
        actionLabel: hasConnectedTool ? "Manage" : "Connect",
        complete: hasConnectedTool,
        description: "Connect GitHub so MCP actions can run against a real startup tool.",
        label: "Connect the first tool",
      },
      {
        actionHref: "#memory",
        actionLabel: hasMemory ? "Review" : "Add memory",
        complete: hasMemory,
        description: "Store durable company facts the assistant should remember.",
        label: "Seed operating memory",
      },
      {
        actionHref: "#command-center",
        actionLabel: hasCommand ? "Run another" : "Try command",
        complete: hasCommand,
        description: "Send a chat or voice command and inspect the generated plan.",
        label: "Run the first command",
      },
      {
        actionHref: "/billing",
        actionLabel: "Open billing",
        complete: hasBillingStatus,
        description: "Confirm plan status, entitlements, and SaaS billing controls.",
        label: "Check billing readiness",
      },
    ];
  }, [
    account.data?.account.companyProfile.name,
    account.data?.account.displayName,
    account.data?.account.profile.timezone,
    billing.data?.billing.status,
    executions.data?.executions.length,
    integrations.data?.connections,
    memories.data?.memories,
  ]);

  const completedCount = checklist.filter((item) => item.complete).length;
  const isLoading =
    account.isLoading ||
    integrations.isLoading ||
    memories.isLoading ||
    executions.isLoading ||
    billing.isLoading;
  const errorMessage = getFirstError([
    account.error,
    integrations.error,
    memories.error,
    executions.error,
    billing.error,
  ]);

  return (
    <section
      aria-labelledby="first-run-title"
      className="rounded-lg border border-border bg-background p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            First-run setup
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground" id="first-run-title">
            Founder launch checklist
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Keep the console useful from the first session by connecting one tool, adding context,
            and proving the command loop.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted">
          {isLoading ? "Loading" : `${completedCount}/${checklist.length} ready`}
        </span>
      </div>

      {!isOnline ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You are offline. Existing setup state may be stale until the browser reconnects.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <ol className="mt-4 grid gap-2">
        {checklist.map((item) => (
          <ChecklistRow item={item} key={item.label} />
        ))}
      </ol>
    </section>
  );
}
