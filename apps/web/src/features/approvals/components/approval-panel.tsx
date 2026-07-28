"use client";

import { cn } from "@faios/ui";
import { ApprovalApiError, type ApprovalPayload, type ApprovalRequest } from "../types/approval";
import { useApproveRequest, useApprovals, useRejectRequest } from "../hooks/use-approvals";

function formatError(error: Error) {
  if (error instanceof ApprovalApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function humanizeKey(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringifyPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return "No execution payload recorded.";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Execution payload could not be rendered.";
  }
}

function getPayloadPreview(payload: ApprovalPayload | undefined) {
  const executionPayload = payload?.executionPayload;

  if (!isRecord(executionPayload)) {
    return undefined;
  }

  if (typeof executionPayload.title === "string") {
    const labels = Array.isArray(executionPayload.labels)
      ? executionPayload.labels.filter((label): label is string => typeof label === "string")
      : [];

    return {
      title: executionPayload.title,
      detail:
        typeof executionPayload.body === "string"
          ? executionPayload.body
          : labels.length > 0
            ? `Labels: ${labels.join(", ")}`
            : "External action payload is ready for review.",
      labels,
    };
  }

  const keys = Object.keys(executionPayload).slice(0, 5);

  return {
    title: "Structured action payload",
    detail: keys.length > 0 ? `Fields: ${keys.join(", ")}` : "Payload is empty.",
    labels: [],
  };
}

function PayloadPreview({ payload }: Readonly<{ payload: ApprovalPayload | undefined }>) {
  const preview = getPayloadPreview(payload);

  if (!payload?.executionPayload) {
    return (
      <div className="rounded-md border border-border bg-white p-3 text-xs leading-5 text-muted">
        No provider payload was attached to this approval. FAIOS will use the planned capability
        metadata if this action is approved.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {preview ? (
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-sm font-semibold text-foreground">{preview.title}</p>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted">{preview.detail}</p>
          {preview.labels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.labels.map((label) => (
                <span
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="rounded-md border border-border bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
          Redacted payload
        </summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted">
          {stringifyPayload(payload.executionPayload)}
        </pre>
      </details>
    </div>
  );
}

function ApprovalCard({ approval }: Readonly<{ approval: ApprovalRequest }>) {
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const isApproving = approve.isPending;
  const isRejecting = reject.isPending;
  const isDeciding = isApproving || isRejecting;
  const capability = approval.payload?.capability ?? "approval.required";
  const provider = approval.payload?.provider;
  const riskReason = approval.payload?.reason ?? approval.reason;

  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Approval required
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{humanizeKey(capability)}</h3>
          <p className="mt-1 text-xs text-muted">{provider ?? "Provider pending"}</p>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
          Pending
        </span>
      </div>

      <div className="mt-3 grid gap-3">
        <div className="rounded-md border border-accent/20 bg-accent/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Why approval</p>
          <p className="mt-2 text-sm leading-6 text-muted">{riskReason}</p>
        </div>

        {approval.payload?.commandSummary ? (
          <div className="rounded-md border border-border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Command plan</p>
            <p className="mt-2 text-sm leading-6 text-muted">{approval.payload.commandSummary}</p>
          </div>
        ) : null}

        <PayloadPreview payload={approval.payload} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Requested {new Date(approval.requestedAt).toLocaleString()}
        </p>
        <div className="flex gap-2">
          <button
            className={cn(
              "inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-semibold text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60",
            )}
            disabled={isDeciding}
            onClick={() => reject.mutate(approval.id)}
            type="button"
          >
            {isRejecting ? "Rejecting" : "Reject"}
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
            disabled={isDeciding}
            onClick={() => approve.mutate(approval.id)}
            type="button"
          >
            {isApproving ? "Approving" : "Approve"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ApprovalPanel() {
  const approvals = useApprovals();
  const pendingApprovals = approvals.data?.approvals ?? [];

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Approval gate</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Pending approvals</h2>
        </div>
        {approvals.isFetching ? (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted">
            Refreshing
          </span>
        ) : null}
      </div>

      {approvals.isLoading ? (
        <div className="mt-4 grid gap-2">
          {[0, 1].map((item) => (
            <div className="h-24 rounded-md border border-border bg-background" key={item} />
          ))}
        </div>
      ) : null}

      {approvals.error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {formatError(approvals.error)}
        </div>
      ) : null}

      {!approvals.isLoading && !approvals.error && pendingApprovals.length === 0 ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-muted">
          No pending approvals.
        </div>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {pendingApprovals.map((approval) => (
            <ApprovalCard approval={approval} key={approval.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
