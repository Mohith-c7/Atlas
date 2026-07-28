"use client";

import { cn } from "@faios/ui";
import { WorkflowApiError, type WorkflowReadinessStatus } from "../types/workflow";
import { useFounderWorkflows } from "../hooks/use-founder-workflows";

const readinessStyles: Record<WorkflowReadinessStatus, string> = {
  disabled: "border-border bg-background text-muted",
  not_connected: "border-amber-200 bg-amber-50 text-amber-700",
  planned: "border-border bg-background text-muted",
  ready: "border-primary/20 bg-primary/10 text-primary",
};

const readinessLabels: Record<WorkflowReadinessStatus, string> = {
  disabled: "Disabled",
  not_connected: "Connect tool",
  planned: "Planned",
  ready: "Ready",
};

const executionModeLabels = {
  automatic: "Automatic",
  approval_required: "Approval required",
  planned_only: "Planned only",
} as const;

function formatError(error: Error) {
  if (error instanceof WorkflowApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

export function WorkflowCatalogPanel() {
  const workflows = useFounderWorkflows();
  const visibleWorkflows = workflows.data?.workflows ?? [];

  return (
    <section
      aria-busy={workflows.isLoading || workflows.isFetching}
      className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Workflow catalog</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Founder workflows</h2>
        </div>
        {workflows.isFetching ? (
          <span
            aria-live="polite"
            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted"
          >
            Syncing
          </span>
        ) : null}
      </div>

      {workflows.isLoading ? (
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((item) => (
            <div className="h-20 rounded-md border border-border bg-background" key={item} />
          ))}
        </div>
      ) : null}

      {workflows.error ? (
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {formatError(workflows.error)}
        </div>
      ) : null}

      {!workflows.isLoading && !workflows.error && visibleWorkflows.length === 0 ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-muted">
          No workflows are available yet.
        </div>
      ) : null}

      {visibleWorkflows.length > 0 ? (
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {visibleWorkflows.map((workflow) => (
            <article
              className="rounded-md border border-border bg-background p-3"
              key={workflow.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{workflow.title}</h3>
                  <p className="mt-1 text-xs text-muted">{workflow.provider}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    readinessStyles[workflow.readinessStatus],
                  )}
                >
                  {readinessLabels[workflow.readinessStatus]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{workflow.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-muted">
                  {executionModeLabels[workflow.executionMode]}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    workflow.requiresApproval
                      ? "border-accent/20 bg-accent/10 text-accent"
                      : "border-primary/20 bg-primary/10 text-primary",
                  )}
                >
                  {workflow.requiresApproval ? "Approval" : "Read-only"}
                </span>
              </div>
              {workflow.triggerExamples[0] ? (
                <p className="mt-3 border-l-2 border-border pl-3 text-xs leading-5 text-muted">
                  {workflow.triggerExamples[0]}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
