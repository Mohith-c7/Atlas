"use client";

import Link from "next/link";
import { cn } from "@faios/ui";
import { useCommandExecutions } from "../hooks/use-command-executions";
import type {
  CommandExecutionTimelineItem,
  ExecutionStatus,
  ToolInvocation,
} from "../types/execution";

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

const invocationStatusStyles: Record<ExecutionStatus, string> = {
  cancelled: "border-muted bg-muted/30 text-muted",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-border bg-muted/30 text-muted",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  succeeded: "border-primary/25 bg-primary/10 text-primary",
};

const invocationStatusLabels: Record<ExecutionStatus, string> = {
  cancelled: "Cancelled",
  failed: "Failed",
  pending: "Queued",
  running: "Running",
  succeeded: "Succeeded",
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stringifyPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return "No payload recorded.";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Payload could not be rendered.";
  }
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-36 animate-pulse rounded-md bg-muted/30" />
      <div className="h-56 animate-pulse rounded-md bg-muted/30" />
    </div>
  );
}

function InvocationDetail({ invocation }: { invocation: ToolInvocation }) {
  return (
    <article className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {invocation.provider ?? "provider pending"}
          </p>
          <h2 className="mt-2 text-base font-semibold text-foreground">
            {invocation.capabilityKey}
          </h2>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-semibold",
            invocationStatusStyles[invocation.status],
          )}
        >
          {invocationStatusLabels[invocation.status]}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md bg-background p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Queued</dt>
          <dd className="mt-1 text-foreground">{formatDateTime(invocation.createdAt)}</dd>
        </div>
        <div className="rounded-md bg-background p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Started</dt>
          <dd className="mt-1 text-foreground">{formatDateTime(invocation.startedAt)}</dd>
        </div>
        <div className="rounded-md bg-background p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Completed</dt>
          <dd className="mt-1 text-foreground">{formatDateTime(invocation.completedAt)}</dd>
        </div>
      </dl>

      {invocation.errorMessage ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {invocation.errorCode ? `${invocation.errorCode}: ` : ""}
          {invocation.errorMessage}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Request payload
          </p>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted">
            {stringifyPayload(invocation.requestPayload)}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Response payload
          </p>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted">
            {stringifyPayload(invocation.responsePayload)}
          </pre>
        </div>
      </div>
    </article>
  );
}

export function CommandDetailPage({ commandId }: { commandId: string }) {
  const executionsQuery = useCommandExecutions();
  const execution = executionsQuery.data?.executions.find((item) => item.commandId === commandId);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Command detail
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-foreground">
              Execution review
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
              href="/commands"
            >
              History
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
              href="/"
            >
              Console
            </Link>
          </div>
        </header>

        {executionsQuery.isLoading ? <DetailSkeleton /> : null}

        {executionsQuery.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {executionsQuery.error instanceof Error
              ? executionsQuery.error.message
              : "Unable to load command detail."}
          </p>
        ) : null}

        {!executionsQuery.isLoading && !executionsQuery.error && !execution ? (
          <section className="rounded-md border border-dashed border-border bg-white p-6">
            <p className="text-sm font-semibold text-foreground">Command not found</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              This command is not in the current founder execution feed. It may have been deleted,
              belong to another session, or not finished planning yet.
            </p>
          </section>
        ) : null}

        {execution ? (
          <>
            <section className="rounded-md border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-semibold",
                      commandStatusStyles[execution.status],
                    )}
                  >
                    {commandStatusLabels[execution.status]}
                  </span>
                  <h2 className="mt-4 text-xl font-semibold leading-7 text-foreground">
                    {execution.summary ?? execution.rawInput}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                    {execution.rawInput}
                  </p>
                </div>
                <p className="rounded-md bg-background p-3 text-sm text-muted">
                  Updated {formatDateTime(execution.updatedAt)}
                </p>
              </div>
            </section>

            <section className="grid gap-4" aria-label="Tool invocations">
              {execution.invocations.length > 0 ? (
                execution.invocations.map((invocation) => (
                  <InvocationDetail invocation={invocation} key={invocation.id} />
                ))
              ) : (
                <p className="rounded-md border border-dashed border-border bg-white p-5 text-sm text-muted">
                  No tool invocations have been queued for this command yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
