"use client";

import Link from "next/link";
import { cn } from "@faios/ui";
import { useCommandExecutions } from "../hooks/use-command-executions";
import type { CommandExecutionTimelineItem } from "../types/execution";

const commandStatusStyles: Record<CommandExecutionTimelineItem["status"], string> = {
  awaiting_approval: "border-accent/30 bg-accent/10 text-accent",
  cancelled: "border-muted bg-muted/30 text-muted",
  completed: "border-primary/25 bg-primary/10 text-primary",
  executing: "border-blue-200 bg-blue-50 text-blue-700",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  planning: "border-blue-200 bg-blue-50 text-blue-700",
  received: "border-border bg-muted/30 text-muted",
};

const commandStatusLabels: Record<CommandExecutionTimelineItem["status"], string> = {
  awaiting_approval: "Awaiting approval",
  cancelled: "Cancelled",
  completed: "Completed",
  executing: "Executing",
  failed: "Failed",
  planning: "Planning",
  received: "Received",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function CommandHistorySkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-28 animate-pulse rounded-md bg-muted/30" />
      <div className="h-28 animate-pulse rounded-md bg-muted/30" />
      <div className="h-28 animate-pulse rounded-md bg-muted/30" />
    </div>
  );
}

function CommandHistoryEmpty() {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-6">
      <p className="text-sm font-semibold text-foreground">No command history yet</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Send a command from the founder console. FAIOS will show the plan, approval state, and tool
        execution progress here.
      </p>
      <Link
        className="mt-4 inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
        href="/"
      >
        Open console
      </Link>
    </div>
  );
}

function CommandHistoryCard({ execution }: { execution: CommandExecutionTimelineItem }) {
  const failedInvocations = execution.invocations.filter(
    (invocation) => invocation.status === "failed",
  ).length;
  const runningInvocations = execution.invocations.filter(
    (invocation) => invocation.status === "running",
  ).length;

  return (
    <article className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-semibold",
                commandStatusStyles[execution.status],
              )}
            >
              {commandStatusLabels[execution.status]}
            </span>
            <p className="text-xs text-muted">Updated {formatDateTime(execution.updatedAt)}</p>
          </div>
          <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-6 text-foreground">
            {execution.summary ?? execution.rawInput}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{execution.rawInput}</p>
        </div>
        <Link
          className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-border px-3 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
          href={`/commands/${execution.commandId}`}
        >
          Open
        </Link>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-3">
        <p className="rounded-md bg-background p-3">
          <span className="font-semibold text-foreground">{execution.invocations.length}</span> tool
          action{execution.invocations.length === 1 ? "" : "s"}
        </p>
        <p className="rounded-md bg-background p-3">
          <span className="font-semibold text-foreground">{runningInvocations}</span> running
        </p>
        <p className="rounded-md bg-background p-3">
          <span className="font-semibold text-foreground">{failedInvocations}</span> failed
        </p>
      </div>
    </article>
  );
}

export function CommandHistoryPage() {
  const executionsQuery = useCommandExecutions();
  const executions = executionsQuery.data?.executions ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Command history
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-foreground">
              Founder execution ledger
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Review what FAIOS planned, what needs approval, and how connected tool work is
              progressing.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
            href="/"
          >
            Console
          </Link>
        </header>

        {executionsQuery.isLoading ? <CommandHistorySkeleton /> : null}

        {executionsQuery.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {executionsQuery.error instanceof Error
              ? executionsQuery.error.message
              : "Unable to load command history."}
          </p>
        ) : null}

        {!executionsQuery.isLoading && !executionsQuery.error ? (
          <section className="grid gap-4" aria-label="Commands">
            {executions.length > 0 ? (
              executions.map((execution) => (
                <CommandHistoryCard execution={execution} key={execution.commandId} />
              ))
            ) : (
              <CommandHistoryEmpty />
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
