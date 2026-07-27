"use client";

import { useMemo } from "react";
import { IntegrationApiError } from "../types/integration";
import { useIntegrationCatalog } from "../hooks/use-integration-connections";

function formatError(error: Error) {
  if (error instanceof IntegrationApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

function humanizeKey(value: string) {
  return value.replaceAll("_", " ");
}

function getCapabilitySummary(integration: {
  capabilities: Array<{ status: string; requiresApproval: boolean }>;
}) {
  const available = integration.capabilities.filter(
    (capability) => capability.status === "available",
  ).length;
  const approvalRequired = integration.capabilities.filter(
    (capability) => capability.requiresApproval,
  ).length;

  return {
    approvalRequired,
    available,
    total: integration.capabilities.length,
  };
}

export function IntegrationCatalogPanel() {
  const catalog = useIntegrationCatalog();
  const errorMessage = useMemo(
    () => (catalog.error ? formatError(catalog.error) : undefined),
    [catalog.error],
  );

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">MCP catalog</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Integration lifecycle</h2>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
          {catalog.data?.integrations.length ?? 0} providers
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {(catalog.data?.integrations ?? []).map((integration) => {
          const summary = getCapabilitySummary(integration);

          return (
            <div
              className="rounded-md border border-border bg-background p-3 text-xs"
              key={integration.provider}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{integration.label}</p>
                  <p className="mt-1 text-muted">
                    {summary.available}/{summary.total} capabilities available
                    {summary.approvalRequired ? `, ${summary.approvalRequired} approval gated` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 font-medium text-muted">
                  {integration.connection?.status ?? integration.status}
                </span>
              </div>
              {integration.connection?.lastHealthMessage ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  {integration.connection.lastHealthMessage}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {integration.capabilities.map((capability) => (
                  <span
                    className="rounded-full border border-border bg-white px-2 py-1 font-medium text-muted"
                    key={`${integration.provider}-${capability.key}`}
                  >
                    {capability.label} · {humanizeKey(capability.status)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
