"use client";

import { cn } from "@faios/ui";
import type {
  CommandExecutionTimelineItem,
  ExecutionStatus,
  ToolInvocation,
} from "../types/execution";
import { useCommandExecutions } from "../hooks/use-command-executions";

const invocationStatusLabels: Record<ExecutionStatus, string> = {
  pending: "Queued",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const invocationStatusStyles: Record<ExecutionStatus, string> = {
  pending: "border-border bg-muted/40 text-muted",
  running: "border-primary/30 bg-primary/10 text-primary",
  succeeded: "border-accent/30 bg-accent/10 text-accent",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-muted bg-muted/30 text-muted",
};

const commandStatusLabels: Record<CommandExecutionTimelineItem["status"], string> = {
  received: "Received",
  planning: "Planning",
  awaiting_approval: "Awaiting approval",
  executing: "Executing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getExecutionSummary(invocation: ToolInvocation) {
  if (invocation.status === "failed" && invocation.errorMessage) {
    return invocation.errorMessage;
  }

  if (invocation.status === "pending") {
    if (invocation.nextAttemptAt) {
      return `Retry scheduled for ${formatTime(invocation.nextAttemptAt)}.`;
    }

    return "Waiting for the worker to claim this action.";
  }

  if (invocation.status === "running") {
    return "The worker has claimed this action.";
  }

  if (invocation.status === "succeeded") {
    return "The action completed successfully.";
  }

  return "The action was cancelled before completion.";
}

function EmptyTimeline() {
  return (
    <div className="rounded-md border border-dashed border-border bg-background p-5 text-sm text-muted">
      Approved actions will appear here once FAIOS queues tool work.
    </div>
  );
}

function InvocationRow({ invocation }: { invocation: ToolInvocation }) {
  return (
    <li className="grid gap-2 border-l border-border pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{invocation.capabilityKey}</p>
          <p className="mt-1 text-xs text-muted">{invocation.provider ?? "provider pending"}</p>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium",
            invocationStatusStyles[invocation.status],
          )}
        >
          {invocationStatusLabels[invocation.status]}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted">{getExecutionSummary(invocation)}</p>
      {typeof invocation.retryCount === "number" && typeof invocation.maxRetries === "number" ? (
        <p className="text-xs text-muted">
          Attempt {invocation.retryCount + 1} of {invocation.maxRetries + 1}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        {invocation.completedAt
          ? `Completed ${formatTime(invocation.completedAt)}`
          : invocation.startedAt
            ? `Started ${formatTime(invocation.startedAt)}`
            : `Queued ${formatTime(invocation.createdAt)}`}
      </p>
    </li>
  );
}

function ExecutionCard({ execution }: { execution: CommandExecutionTimelineItem }) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted">
            {commandStatusLabels[execution.status]} · {formatTime(execution.updatedAt)}
          </p>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
            {execution.summary ?? execution.rawInput}
          </h3>
        </div>
        <p className="rounded-md border border-border px-2 py-1 text-xs text-muted">
          {execution.invocations.length} action{execution.invocations.length === 1 ? "" : "s"}
        </p>
      </div>

      {execution.invocations.length > 0 ? (
        <ul className="mt-4 grid gap-4">
          {execution.invocations.map((invocation) => (
            <InvocationRow invocation={invocation} key={invocation.id} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md bg-muted/30 p-3 text-sm text-muted">
          Waiting for founder approval before tool work is queued.
        </p>
      )}
    </article>
  );
}

export function ExecutionTimelinePanel() {
  const executionsQuery = useCommandExecutions();
  const executions = executionsQuery.data?.executions ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Execution timeline
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Tool work</h2>
        </div>
        {executionsQuery.isFetching ? (
          <p className="rounded-md bg-muted/30 px-2 py-1 text-xs text-muted">Refreshing</p>
        ) : null}
      </div>

      {executionsQuery.isLoading ? (
        <div className="mt-5 grid gap-3">
          <div className="h-24 animate-pulse rounded-md bg-muted/30" />
          <div className="h-20 animate-pulse rounded-md bg-muted/30" />
        </div>
      ) : null}

      {executionsQuery.error ? (
        <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {executionsQuery.error instanceof Error
            ? executionsQuery.error.message
            : "Unable to load execution history."}
        </p>
      ) : null}

      {!executionsQuery.isLoading && !executionsQuery.error ? (
        <div className="mt-5 grid gap-4">
          {executions.length > 0 ? (
            executions.map((execution) => (
              <ExecutionCard execution={execution} key={execution.commandId} />
            ))
          ) : (
            <EmptyTimeline />
          )}
        </div>
      ) : null}
    </section>
  );
}
