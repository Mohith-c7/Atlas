"use client";

import { cn } from "@faios/ui";

import { useMcpCapabilities } from "../hooks/use-mcp-capabilities";
import { McpApiError, type McpCapabilityStatus } from "../types/capability";

const statusStyles: Record<McpCapabilityStatus, string> = {
  available: "border-primary/20 bg-primary/10 text-primary",
  disabled: "border-border bg-background text-muted",
  not_connected: "border-amber-200 bg-amber-50 text-amber-700",
};

const statusLabels: Record<McpCapabilityStatus, string> = {
  available: "Available",
  disabled: "Disabled",
  not_connected: "Not connected",
};

function formatError(error: Error) {
  if (error instanceof McpApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

export function CapabilityReadinessPanel() {
  const capabilities = useMcpCapabilities();
  const visibleCapabilities = capabilities.data?.capabilities.slice(0, 6) ?? [];

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">MCP registry</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Capability readiness</h2>
        </div>
        {capabilities.isFetching ? (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted">
            Syncing
          </span>
        ) : null}
      </div>

      {capabilities.isLoading ? (
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((item) => (
            <div className="h-14 rounded-md border border-border bg-background" key={item} />
          ))}
        </div>
      ) : null}

      {capabilities.error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {formatError(capabilities.error)}
        </div>
      ) : null}

      {!capabilities.isLoading && !capabilities.error && visibleCapabilities.length === 0 ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-muted">
          No MCP capabilities are available yet.
        </div>
      ) : null}

      {visibleCapabilities.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {visibleCapabilities.map((capability) => (
            <article
              className="rounded-md border border-border bg-background p-3"
              key={`${capability.provider}-${capability.key}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{capability.label}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {capability.provider} / {capability.key}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    statusStyles[capability.status],
                  )}
                >
                  {statusLabels[capability.status]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{capability.description}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-muted">
                  {capability.provider}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    capability.requiresApproval
                      ? "border-accent/20 bg-accent/10 text-accent"
                      : "border-primary/20 bg-primary/10 text-primary",
                  )}
                >
                  {capability.requiresApproval ? "Approval required" : "Auto-safe"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
