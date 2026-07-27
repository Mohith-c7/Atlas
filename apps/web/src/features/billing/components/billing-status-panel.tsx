"use client";

import { useMemo } from "react";
import {
  useBillingStatus,
  useCreateBillingCheckoutSession,
  useCreateBillingPortalSession,
} from "../hooks/use-billing-status";
import { BillingApiError } from "../types/billing";

function formatError(error: Error) {
  if (error instanceof BillingApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

export function BillingStatusPanel() {
  const billing = useBillingStatus();
  const checkout = useCreateBillingCheckoutSession();
  const portal = useCreateBillingPortalSession();
  const errorMessage = useMemo(
    () =>
      billing.error
        ? formatError(billing.error)
        : checkout.error
          ? formatError(checkout.error)
          : portal.error
            ? formatError(portal.error)
            : undefined,
    [billing.error, checkout.error, portal.error],
  );
  const status = billing.data?.billing;

  function createReturnUrl(path: string) {
    return `${window.location.origin}${path}`;
  }

  function handleCheckout() {
    checkout.mutate(
      {
        planKey: "pro",
        successUrl: createReturnUrl("/?billing=success"),
        cancelUrl: createReturnUrl("/?billing=cancelled"),
      },
      {
        onSuccess: (response) => {
          window.location.assign(response.checkoutUrl);
        },
      },
    );
  }

  function handlePortal() {
    portal.mutate(
      {
        returnUrl: createReturnUrl("/"),
      },
      {
        onSuccess: (response) => {
          window.location.assign(response.portalUrl);
        },
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Billing</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {status ? `${status.planKey} plan` : "Plan status"}
          </h2>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {status?.status ?? "loading"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Entitlements</p>
          <p className="mt-1 text-muted">
            {status?.entitlements.length
              ? `${status.entitlements.length} configured`
              : "No plan limits configured"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Usage counters</p>
          <p className="mt-1 text-muted">
            {status?.usage.length ? `${status.usage.length} active` : "No usage recorded"}
          </p>
        </div>
      </div>

      {status?.currentPeriodEnd ? (
        <p className="mt-3 text-xs text-muted">
          Current period ends {new Date(status.currentPeriodEnd).toLocaleDateString()}.
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={checkout.isPending}
          onClick={handleCheckout}
          type="button"
        >
          {checkout.isPending ? "Opening checkout..." : "Upgrade to Pro"}
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={portal.isPending}
          onClick={handlePortal}
          type="button"
        >
          {portal.isPending ? "Opening portal..." : "Billing portal"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
