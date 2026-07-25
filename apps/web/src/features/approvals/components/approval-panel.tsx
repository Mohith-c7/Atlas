"use client";

import { cn } from "@faios/ui";
import { ApprovalApiError, type ApprovalRequest } from "../types/approval";
import { useApproveRequest, useApprovals, useRejectRequest } from "../hooks/use-approvals";

function formatError(error: Error) {
  if (error instanceof ApprovalApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

function ApprovalCard({ approval }: Readonly<{ approval: ApprovalRequest }>) {
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const isDeciding = approve.isPending || reject.isPending;
  const capability = approval.payload?.capability ?? "approval.required";
  const provider = approval.payload?.provider;

  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Approval required
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{capability}</h3>
          {provider ? <p className="mt-1 text-xs text-muted">{provider}</p> : null}
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
          Pending
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted">{approval.reason}</p>

      {approval.payload?.commandSummary ? (
        <p className="mt-3 rounded-md border border-border bg-white p-3 text-xs leading-5 text-muted">
          {approval.payload.commandSummary}
        </p>
      ) : null}

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
            Reject
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
            disabled={isDeciding}
            onClick={() => approve.mutate(approval.id)}
            type="button"
          >
            Approve
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
