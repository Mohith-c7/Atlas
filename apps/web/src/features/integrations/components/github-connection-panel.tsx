"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { IntegrationApiError } from "../types/integration";
import {
  useConnectGitHubIntegration,
  useDisconnectIntegration,
  useIntegrationConnections,
  useReconnectIntegration,
  useRotateGitHubCredential,
  useStartGitHubOAuth,
} from "../hooks/use-integration-connections";
import { githubOAuthCallbackUrl } from "../../../lib/config";

function formatError(error: Error) {
  if (error instanceof IntegrationApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

export function GitHubConnectionPanel() {
  const connections = useIntegrationConnections();
  const connectGitHub = useConnectGitHubIntegration();
  const disconnectIntegration = useDisconnectIntegration();
  const reconnectIntegration = useReconnectIntegration();
  const rotateGitHubCredential = useRotateGitHubCredential();
  const startGitHubOAuth = useStartGitHubOAuth();
  const githubConnection = connections.data?.connections.find(
    (connection) => connection.provider === "github",
  );

  const [owner, setOwner] = useState(githubConnection?.metadata?.owner ?? "");
  const [repo, setRepo] = useState(githubConnection?.metadata?.repo ?? "");
  const [accountLabel, setAccountLabel] = useState(githubConnection?.accountLabel ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [showManualToken, setShowManualToken] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState("");

  useEffect(() => {
    if (!githubConnection) {
      return;
    }

    setOwner(githubConnection.metadata?.owner ?? "");
    setRepo(githubConnection.metadata?.repo ?? "");
    setAccountLabel(githubConnection.accountLabel ?? "");
  }, [githubConnection]);

  const canSubmit =
    owner.trim().length > 0 &&
    repo.trim().length > 0 &&
    (showManualToken ? accessToken.trim().length > 0 : true) &&
    !connectGitHub.isPending;
  const canStartOAuth =
    owner.trim().length > 0 && repo.trim().length > 0 && !startGitHubOAuth.isPending;
  const canDisconnect =
    Boolean(githubConnection) &&
    githubConnection?.status !== "disconnected" &&
    !disconnectIntegration.isPending;
  const canReconnect =
    githubConnection?.status === "disconnected" && !reconnectIntegration.isPending;
  const canRotate =
    Boolean(githubConnection) &&
    owner.trim().length > 0 &&
    repo.trim().length > 0 &&
    accessToken.trim().length > 0 &&
    !rotateGitHubCredential.isPending;

  const errorMessage = useMemo(() => {
    if (connectGitHub.error) {
      return formatError(connectGitHub.error);
    }

    if (startGitHubOAuth.error) {
      return formatError(startGitHubOAuth.error);
    }

    if (disconnectIntegration.error) {
      return formatError(disconnectIntegration.error);
    }

    if (reconnectIntegration.error) {
      return formatError(reconnectIntegration.error);
    }

    if (rotateGitHubCredential.error) {
      return formatError(rotateGitHubCredential.error);
    }

    if (connections.error) {
      return formatError(connections.error);
    }

    return undefined;
  }, [
    connectGitHub.error,
    connections.error,
    disconnectIntegration.error,
    reconnectIntegration.error,
    rotateGitHubCredential.error,
    startGitHubOAuth.error,
  ]);

  function handleOAuthStart() {
    if (!canStartOAuth) {
      return;
    }

    startGitHubOAuth.mutate(
      {
        accountLabel: accountLabel.trim() || undefined,
        owner: owner.trim(),
        repo: repo.trim(),
        redirectUri: githubOAuthCallbackUrl,
      },
      {
        onSuccess: (response) => {
          window.location.assign(response.authorizationUrl);
        },
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || !showManualToken) {
      return;
    }

    connectGitHub.mutate(
      {
        accountLabel: accountLabel.trim() || undefined,
        owner: owner.trim(),
        repo: repo.trim(),
        accessToken: accessToken.trim(),
      },
      {
        onSuccess: (response) => {
          setAccountLabel(response.connection.accountLabel ?? "");
          setAccessToken("");
        },
      },
    );
  }

  function handleDisconnect() {
    if (!canDisconnect) {
      return;
    }

    disconnectIntegration.mutate({
      provider: "github",
      reason: disconnectReason.trim() || undefined,
    });
  }

  function handleReconnect() {
    if (!canReconnect) {
      return;
    }

    reconnectIntegration.mutate("github");
  }

  function handleRotateCredential() {
    if (!canRotate) {
      return;
    }

    rotateGitHubCredential.mutate(
      {
        accountLabel: accountLabel.trim() || undefined,
        owner: owner.trim(),
        repo: repo.trim(),
        accessToken: accessToken.trim(),
        reason: "manual_rotation",
      },
      {
        onSuccess: () => {
          setAccessToken("");
        },
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Integrations</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">GitHub connection</h2>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {githubConnection?.status ?? "not connected"}
        </span>
      </div>

      {githubConnection ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-xs text-muted">
          <p className="font-medium text-foreground">{githubConnection.accountLabel ?? "GitHub"}</p>
          <p className="mt-1">
            {githubConnection.metadata?.owner}/{githubConnection.metadata?.repo}
          </p>
          <p className="mt-1">{githubConnection.capabilityKeys.join(", ")}</p>
          {githubConnection.statusReason ? (
            <p className="mt-1 text-red-700">{githubConnection.statusReason}</p>
          ) : null}
          {githubConnection.connectedAt ? (
            <p className="mt-1">
              Connected {new Date(githubConnection.connectedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {githubConnection ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Disconnect reason
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setDisconnectReason(event.target.value)}
              placeholder="Temporarily pausing GitHub actions"
              value={disconnectReason}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canDisconnect}
              onClick={handleDisconnect}
              type="button"
            >
              {disconnectIntegration.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canReconnect}
              onClick={handleReconnect}
              type="button"
            >
              {reconnectIntegration.isPending ? "Reconnecting..." : "Reconnect"}
            </button>
          </div>
        </div>
      ) : null}

      <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Owner
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setOwner(event.target.value)}
              placeholder="octo-org"
              value={owner}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Repository
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setRepo(event.target.value)}
              placeholder="startup-os"
              value={repo}
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Label
          <input
            className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
            onChange={(event) => setAccountLabel(event.target.value)}
            placeholder="Product GitHub"
            value={accountLabel}
          />
        </label>

        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={!canStartOAuth}
          onClick={handleOAuthStart}
          type="button"
        >
          {startGitHubOAuth.isPending ? "Opening GitHub..." : "Connect with GitHub"}
        </button>

        <button
          className="text-left text-xs font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setShowManualToken((value) => !value)}
          type="button"
        >
          {showManualToken ? "Hide development token fallback" : "Use development token fallback"}
        </button>

        {showManualToken ? (
          <>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Access token
              <input
                autoComplete="off"
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="ghp_..."
                type="password"
                value={accessToken}
              />
            </label>

            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
              type="submit"
            >
              {connectGitHub.isPending ? "Connecting..." : "Connect with token"}
            </button>

            {githubConnection ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canRotate}
                onClick={handleRotateCredential}
                type="button"
              >
                {rotateGitHubCredential.isPending ? "Rotating..." : "Rotate token"}
              </button>
            ) : null}
          </>
        ) : null}
      </form>

      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
