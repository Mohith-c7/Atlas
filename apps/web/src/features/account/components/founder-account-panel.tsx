"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  useFounderAccount,
  useFounderSessions,
  useRevokeFounderSession,
  useUpdateFounderAccount,
} from "../hooks/use-founder-account";
import { AccountApiError } from "../types/account";

function formatError(error: Error) {
  if (error instanceof AccountApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

export function FounderAccountPanel() {
  const account = useFounderAccount();
  const sessions = useFounderSessions();
  const updateAccount = useUpdateFounderAccount();
  const revokeSession = useRevokeFounderSession();
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!account.data?.account) {
      return;
    }

    setDisplayName(account.data.account.displayName ?? "");
    setTimezone(account.data.account.profile.timezone ?? "");
    setCompanyName(account.data.account.companyProfile.name ?? "");
  }, [account.data?.account]);

  const errorMessage = useMemo(() => {
    if (account.error) {
      return formatError(account.error);
    }

    if (sessions.error) {
      return formatError(sessions.error);
    }

    if (updateAccount.error) {
      return formatError(updateAccount.error);
    }

    if (revokeSession.error) {
      return formatError(revokeSession.error);
    }

    return undefined;
  }, [account.error, revokeSession.error, sessions.error, updateAccount.error]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    updateAccount.mutate({
      displayName: displayName.trim() || undefined,
      profile: {
        timezone: timezone.trim() || null,
      },
      companyProfile: {
        name: companyName.trim() || null,
      },
    });
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Account</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {account.data?.account.email ?? "Founder session"}
          </h2>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
          Solo founder
        </span>
      </div>

      <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Display name
          <input
            className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Founder name"
            value={displayName}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Timezone
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Calcutta"
              value={timezone}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Company
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Startup name"
              value={companyName}
            />
          </label>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={updateAccount.isPending}
          type="submit"
        >
          {updateAccount.isPending ? "Saving..." : "Save account context"}
        </button>
      </form>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">Active sessions</p>
        <div className="mt-3 grid gap-2">
          {(sessions.data?.sessions ?? []).map((session) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-xs"
              key={session.id}
            >
              <div>
                <p className="font-medium text-foreground">
                  {session.isCurrent ? "Current session" : (session.userAgent ?? "Session")}
                </p>
                <p className="mt-1 text-muted">
                  {session.status} - expires {new Date(session.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <button
                className="rounded-md border border-border px-3 py-1.5 font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={revokeSession.isPending || session.status !== "active"}
                onClick={() => revokeSession.mutate(session.id)}
                type="button"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
