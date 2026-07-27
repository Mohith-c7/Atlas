"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { IntegrationApiError } from "../types/integration";
import {
  useConnectGitHubIntegration,
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationProviderStatus,
  useReconnectIntegration,
  useRotateGitHubCredential,
  useStartGitHubOAuth,
  useTestIntegrationConnection,
} from "../hooks/use-integration-connections";
import { getGitHubOAuthCallbackUrl } from "../api/github-oauth-client";

function formatError(error: Error) {
  if (error instanceof IntegrationApiError) {
    return error.correlationId
      ? `${error.message} (${error.code}, ${error.correlationId})`
      : `${error.message} (${error.code})`;
  }

  return error.message;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return new Date(value).toLocaleString();
}

function humanizeKey(value: string) {
  return value.replaceAll("_", " ");
}

function detectExpiredToken(message?: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("expired") ||
    normalized.includes("invalid token") ||
    normalized.includes("bad credentials") ||
    normalized.includes("unauthorized")
  );
}

export function GitHubConnectionPanel() {
  const connections = useIntegrationConnections();
  const providerStatus = useIntegrationProviderStatus("github");
  const connectGitHub = useConnectGitHubIntegration();
  const disconnectIntegration = useDisconnectIntegration();
  const reconnectIntegration = useReconnectIntegration();
  const rotateGitHubCredential = useRotateGitHubCredential();
  const startGitHubOAuth = useStartGitHubOAuth();
  const testIntegrationConnection = useTestIntegrationConnection();
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

    if (providerStatus.error) {
      return formatError(providerStatus.error);
    }

    if (testIntegrationConnection.error) {
      return formatError(testIntegrationConnection.error);
    }

    if (connections.error) {
      return formatError(connections.error);
    }

    return undefined;
  }, [
    connectGitHub.error,
    connections.error,
    disconnectIntegration.error,
    providerStatus.error,
    reconnectIntegration.error,
    rotateGitHubCredential.error,
    startGitHubOAuth.error,
    testIntegrationConnection.error,
  ]);

  const providerReadiness = providerStatus.data?.provider;
  const readinessCheckedAt = formatDateTime(providerReadiness?.checkedAt);
  const healthCheckedAt = formatDateTime(githubConnection?.lastHealthCheckedAt);
  const healthMessage =
    githubConnection?.lastHealthMessage ??
    providerReadiness?.capabilities.find((capability) => capability.reason)?.reason;
  const hasExpiredToken =
    detectExpiredToken(healthMessage) || detectExpiredToken(githubConnection?.statusReason);
  const readyCapabilityCount =
    providerReadiness?.capabilities.filter((capability) => capability.status === "ready").length ??
    0;
  const totalCapabilityCount = providerReadiness?.capabilities.length ?? 0;

  function handleOAuthStart() {
    if (!canStartOAuth) {
      return;
    }

    startGitHubOAuth.mutate(
      {
        accountLabel: accountLabel.trim() || undefined,
        owner: owner.trim(),
        repo: repo.trim(),
        redirectUri: getGitHubOAuthCallbackUrl(),
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

  function handleConnectionTest() {
    testIntegrationConnection.mutate("github");
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Integrations</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">GitHub connection</h2>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {providerReadiness?.connected
            ? providerReadiness.provider
            : (githubConnection?.status ?? "not connected")}
        </span>
      </div>

      {githubConnection ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-xs text-muted">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">
                {githubConnection.accountLabel ?? "GitHub"}
              </p>
              <p className="mt-1">
                {githubConnection.metadata?.owner}/{githubConnection.metadata?.repo}
              </p>
            </div>
            <span className="rounded-full border border-border bg-white px-2 py-1 font-medium text-muted">
              {providerReadiness
                ? `${readyCapabilityCount}/${totalCapabilityCount} ready`
                : "health pending"}
            </span>
          </div>
          <p className="mt-2 font-medium text-foreground">Permissions</p>
          <p className="mt-1">{githubConnection.capabilityKeys.map(humanizeKey).join(", ")}</p>
          {githubConnection.statusReason ? (
            <p className="mt-1 text-red-700">{githubConnection.statusReason}</p>
          ) : null}
          {healthMessage ? <p className="mt-1">{healthMessage}</p> : null}
          {hasExpiredToken ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
              Token health requires attention. Rotate the credential or reconnect GitHub before
              running actions.
            </p>
          ) : null}
          {githubConnection.connectedAt || githubConnection.disconnectedAt ? (
            <p className="mt-2">
              {githubConnection.status === "disconnected" && githubConnection.disconnectedAt
                ? `Disconnected ${formatDateTime(githubConnection.disconnectedAt)}`
                : `Connected ${formatDateTime(githubConnection.connectedAt)}`}
            </p>
          ) : null}
          {healthCheckedAt || readinessCheckedAt ? (
            <p className="mt-1">Last checked {healthCheckedAt ?? readinessCheckedAt}</p>
          ) : null}
        </div>
      ) : null}

      {providerReadiness ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-foreground">Provider health</p>
            <button
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-border bg-white px-3 font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={testIntegrationConnection.isPending}
              onClick={handleConnectionTest}
              type="button"
            >
              {testIntegrationConnection.isPending ? "Testing..." : "Test connection"}
            </button>
          </div>
          <div className="mt-2 grid gap-2">
            {providerReadiness.capabilities.map((capability) => (
              <div
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-white px-3 py-2"
                key={capability.capabilityKey}
              >
                <div>
                  <p className="font-medium text-foreground">
                    {humanizeKey(capability.capabilityKey)}
                  </p>
                  {capability.reason ? (
                    <p className="mt-1 text-muted">{capability.reason}</p>
                  ) : null}
                </div>
                <span className="rounded-full border border-border px-2 py-1 font-medium text-muted">
                  {humanizeKey(capability.status)}
                </span>
              </div>
            ))}
          </div>
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
