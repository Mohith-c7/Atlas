"use client";

import { cn } from "@faios/ui";
import { useFounderSessions } from "@/features/account/hooks/use-founder-account";
import { useApprovals } from "@/features/approvals/hooks/use-approvals";
import { useBillingStatus } from "@/features/billing/hooks/use-billing-status";
import { useCommandExecutions } from "@/features/executions/hooks/use-command-executions";
import { useIntegrationConnections } from "@/features/integrations/hooks/use-integration-connections";
import { useMemoryItems } from "@/features/memory/hooks/use-memory-items";
import { useMcpCapabilities } from "@/features/mcp/hooks/use-mcp-capabilities";

type SnapshotStatus = "ready" | "attention" | "working" | "blocked" | "quiet";

const statusStyles: Record<SnapshotStatus, string> = {
  attention: "border-accent/25 bg-accent/10 text-accent",
  blocked: "border-red-200 bg-red-50 text-red-700",
  quiet: "border-border bg-background text-muted",
  ready: "border-primary/25 bg-primary/10 text-primary",
  working: "border-blue-200 bg-blue-50 text-blue-700",
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function SnapshotCard({
  detail,
  label,
  status,
  value,
}: Readonly<{
  detail: string;
  label: string;
  status: SnapshotStatus;
  value: string;
}>) {
  return (
    <article className="rounded-md border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
            statusStyles[status],
          )}
        >
          {status}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-5 text-muted">{detail}</p>
    </article>
  );
}

function getFirstError(errors: readonly unknown[]) {
  const error = errors.find(Boolean);

  if (error instanceof Error) {
    return error.message;
  }

  return error ? "One operating signal could not be loaded." : undefined;
}

export function FounderOperatingSnapshot() {
  const approvals = useApprovals();
  const executions = useCommandExecutions();
  const integrations = useIntegrationConnections();
  const capabilities = useMcpCapabilities();
  const memories = useMemoryItems();
  const billing = useBillingStatus();
  const sessions = useFounderSessions();

  const pendingApprovals = approvals.data?.approvals.length ?? 0;
  const executionItems = executions.data?.executions ?? [];
  const activeExecutions = executionItems.filter((execution) =>
    ["planning", "awaiting_approval", "executing", "received"].includes(execution.status),
  ).length;
  const failedExecutions = executionItems.filter(
    (execution) => execution.status === "failed",
  ).length;
  const connectedTools =
    integrations.data?.connections.filter((connection) => connection.status === "connected")
      .length ?? 0;
  const availableCapabilities =
    capabilities.data?.capabilities.filter((capability) => capability.status === "available")
      .length ?? 0;
  const activeMemories =
    memories.data?.memories.filter((memory) => !memory.archivedAt && !memory.deletedAt).length ?? 0;
  const activeSessions = sessions.data?.sessions.length ?? 0;
  const planStatus = billing.data?.billing.status ?? "unknown";

  const isLoading =
    approvals.isLoading ||
    executions.isLoading ||
    integrations.isLoading ||
    capabilities.isLoading ||
    memories.isLoading ||
    billing.isLoading ||
    sessions.isLoading;
  const isRefreshing =
    approvals.isFetching ||
    executions.isFetching ||
    integrations.isFetching ||
    capabilities.isFetching ||
    memories.isFetching ||
    billing.isFetching ||
    sessions.isFetching;
  const errorMessage = getFirstError([
    approvals.error,
    executions.error,
    integrations.error,
    capabilities.error,
    memories.error,
    billing.error,
    sessions.error,
  ]);

  const commandStatus: SnapshotStatus =
    failedExecutions > 0 ? "blocked" : activeExecutions > 0 ? "working" : "quiet";

  return (
    <section aria-labelledby="operating-snapshot-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Operating snapshot
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground" id="operating-snapshot-title">
            Founder console status
          </h2>
        </div>
        <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted">
          {isLoading ? "Loading" : isRefreshing ? "Refreshing" : "Live"}
        </span>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotCard
          detail={
            pendingApprovals > 0
              ? "Founder decisions are waiting before sensitive tool work runs."
              : "No sensitive actions are waiting on approval."
          }
          label="Approval inbox"
          status={pendingApprovals > 0 ? "attention" : "ready"}
          value={pluralize(pendingApprovals, "pending")}
        />
        <SnapshotCard
          detail={
            failedExecutions > 0
              ? `${pluralize(failedExecutions, "command")} need review in the timeline.`
              : activeExecutions > 0
                ? "FAIOS is planning or executing tool work."
                : "No active command work is running."
          }
          label="Command work"
          status={commandStatus}
          value={pluralize(activeExecutions, "active")}
        />
        <SnapshotCard
          detail={`${pluralize(availableCapabilities, "capability", "capabilities")} are available to the planner.`}
          label="Tool coverage"
          status={connectedTools > 0 && availableCapabilities > 0 ? "ready" : "attention"}
          value={pluralize(connectedTools, "tool")}
        />
        <SnapshotCard
          detail={`${pluralize(activeSessions, "session")} active. Plan status is ${planStatus}.`}
          label="Memory and account"
          status={activeMemories > 0 ? "ready" : "quiet"}
          value={pluralize(activeMemories, "memory", "memories")}
        />
      </div>
    </section>
  );
}
