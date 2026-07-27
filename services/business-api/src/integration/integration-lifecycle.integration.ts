import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { integrationRoutes } from "../features/integrations/index.js";
import { ConnectGitHubIntegrationUseCase } from "../features/integrations/application/connect-github-integration.use-case.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type ConnectionResponse = {
  readonly connection?: {
    readonly id?: string;
    readonly provider?: string;
    readonly status?: string;
    readonly statusReason?: string | null;
  };
};

type ProviderStatusResponse = {
  readonly provider?: {
    readonly connected?: boolean;
    readonly permissionSummary?: {
      readonly provider?: string;
      readonly scopes?: readonly string[];
      readonly checkedAt?: string;
    } | null;
    readonly capabilities?: readonly {
      readonly capabilityKey?: string;
      readonly status?: string;
      readonly reason?: string;
    }[];
  };
};

type RotationResponse = ConnectionResponse & {
  readonly rotatedAt?: string;
};

type RefreshResponse = ConnectionResponse & {
  readonly refreshed?: boolean;
  readonly reason?: string;
};

function expectStatus(response: ConnectionResponse, status: string) {
  if (response.connection?.status !== status) {
    throw new Error(
      `Expected connection status ${status}, received ${response.connection?.status}.`,
    );
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `integration_lifecycle_${suffix}`;
  const rawToken = `faios_integration_lifecycle_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const previousEncryptionKey = process.env.FAIOS_ENCRYPTION_KEY;
  const previousEncryptionKeyVersion = process.env.FAIOS_ENCRYPTION_KEY_VERSION;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";
  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "lifecycle-test-key").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "lifecycle-test-v1";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(integrationRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderId,
        email: `${founderId}@faios.local`,
        sessions: {
          create: {
            tokenHash: hashSessionToken(rawToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });

    await new ConnectGitHubIntegrationUseCase(database).execute(
      {
        accountLabel: "Lifecycle GitHub",
        owner: "faios",
        repo: "atlas",
        accessToken: `ghp_lifecycle_${suffix}`,
        apiBaseUrl: "https://api.github.com",
      },
      `corr_lifecycle_connect_${suffix}`,
      {
        founderId,
        email: `${founderId}@faios.local`,
        displayName: "Lifecycle Founder",
        source: "session",
      },
    );

    const connectedStatusResponse = await server.inject({
      method: "GET",
      url: "/api/v1/integrations/providers/github/status",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (connectedStatusResponse.statusCode !== 200) {
      throw new Error(
        `Expected connected provider status 200, received ${connectedStatusResponse.statusCode}.`,
      );
    }

    const connectedStatus: ProviderStatusResponse = connectedStatusResponse.json();
    const connectedReadiness = connectedStatus.provider?.capabilities?.find(
      (capability) => capability.capabilityKey === "repository.createIssue",
    );

    if (connectedStatus.provider?.connected !== true || connectedReadiness?.status !== "ready") {
      throw new Error("Expected GitHub provider to be ready before disconnect.");
    }

    const disconnectResponse = await server.inject({
      method: "POST",
      url: "/api/v1/integrations/github/disconnect",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
      payload: {
        reason: "testing disconnect lifecycle",
      },
    });

    if (disconnectResponse.statusCode !== 200) {
      throw new Error(`Expected disconnect 200, received ${disconnectResponse.statusCode}.`);
    }

    const disconnected: ConnectionResponse = disconnectResponse.json();
    expectStatus(disconnected, "disconnected");

    if (disconnected.connection?.statusReason !== "testing disconnect lifecycle") {
      throw new Error("Expected disconnect reason to be returned.");
    }

    const disconnectedStatusResponse = await server.inject({
      method: "GET",
      url: "/api/v1/integrations/providers/github/status",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });
    const disconnectedStatus: ProviderStatusResponse = disconnectedStatusResponse.json();
    const disconnectedReadiness = disconnectedStatus.provider?.capabilities?.find(
      (capability) => capability.capabilityKey === "repository.createIssue",
    );

    if (
      disconnectedStatus.provider?.connected !== false ||
      disconnectedReadiness?.status !== "not_ready"
    ) {
      throw new Error("Expected GitHub provider to be not ready after disconnect.");
    }

    const reconnectResponse = await server.inject({
      method: "POST",
      url: "/api/v1/integrations/github/reconnect",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (reconnectResponse.statusCode !== 200) {
      throw new Error(`Expected reconnect 200, received ${reconnectResponse.statusCode}.`);
    }

    const reconnected: ConnectionResponse = reconnectResponse.json();
    expectStatus(reconnected, "connected");

    const healthCheckResponse = await server.inject({
      method: "POST",
      url: "/api/v1/integrations/github/health-check",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (healthCheckResponse.statusCode !== 200) {
      throw new Error(`Expected health check 200, received ${healthCheckResponse.statusCode}.`);
    }

    const healthCheck: ProviderStatusResponse = healthCheckResponse.json();

    if (
      healthCheck.provider?.connected !== true ||
      !healthCheck.provider.permissionSummary?.scopes?.includes("repository.createIssue")
    ) {
      throw new Error("Expected health check to persist a GitHub permission summary.");
    }

    const statusAfterHealthCheckResponse = await server.inject({
      method: "GET",
      url: "/api/v1/integrations/providers/github/status",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });
    const statusAfterHealthCheck: ProviderStatusResponse = statusAfterHealthCheckResponse.json();

    if (!statusAfterHealthCheck.provider?.permissionSummary?.checkedAt) {
      throw new Error("Expected provider status to include persisted permission summary.");
    }

    const refreshResponse = await server.inject({
      method: "POST",
      url: "/api/v1/integrations/github/credentials/refresh",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (refreshResponse.statusCode !== 200) {
      throw new Error(`Expected credential refresh 200, received ${refreshResponse.statusCode}.`);
    }

    const refresh: RefreshResponse = refreshResponse.json();

    if (refresh.refreshed !== false || refresh.reason !== "manual_token_rotation_required") {
      throw new Error("Expected manual GitHub token refresh to require rotation.");
    }

    const rotatedToken = `ghp_lifecycle_rotated_${suffix}`;
    const rotateResponse = await server.inject({
      method: "POST",
      url: "/api/v1/integrations/github/credentials/rotate",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
      payload: {
        accountLabel: "Lifecycle GitHub Rotated",
        owner: "faios",
        repo: "atlas",
        accessToken: rotatedToken,
        apiBaseUrl: "https://api.github.com",
        reason: "scheduled rotation",
      },
    });

    if (rotateResponse.statusCode !== 200) {
      throw new Error(`Expected credential rotation 200, received ${rotateResponse.statusCode}.`);
    }

    const rotated: RotationResponse = rotateResponse.json();
    expectStatus(rotated, "connected");

    if (!rotated.rotatedAt) {
      throw new Error("Expected credential rotation timestamp.");
    }

    if (JSON.stringify(rotated).includes(rotatedToken)) {
      throw new Error("Rotated credential token leaked in response.");
    }

    const storedConnection = await database.integrationConnection.findUniqueOrThrow({
      where: {
        founderId_provider: {
          founderId,
          provider: "github",
        },
      },
      include: {
        credential: true,
        permissionSummary: true,
      },
    });

    if (!storedConnection.credential?.rotatedAt) {
      throw new Error("Expected rotatedAt to be persisted on the credential.");
    }

    if (storedConnection.credential.rotationReason !== "scheduled rotation") {
      throw new Error("Expected credential rotation reason to be persisted.");
    }

    if (!storedConnection.lastHealthCheckedAt || !storedConnection.permissionSummary) {
      throw new Error("Expected health and permission summary state to be persisted.");
    }

    if (storedConnection.credential.refreshFailureReason !== "manual_token_rotation_required") {
      throw new Error("Expected manual refresh attempt metadata to be persisted.");
    }

    const lifecycleEvents = await database.integrationLifecycleEvent.findMany({
      where: {
        founderId,
        provider: "github",
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    const eventTypes = lifecycleEvents.map((event) => event.eventType);

    for (const eventType of [
      "connected",
      "disconnected",
      "reconnected",
      "health_checked",
      "permission_checked",
      "credential_refresh_attempted",
      "credential_rotated",
    ]) {
      if (!eventTypes.includes(eventType)) {
        throw new Error(`Expected lifecycle event ${eventType}.`);
      }
    }
  } finally {
    if (previousAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = previousAppEnv;
    }

    if (previousDevAuthEnabled === undefined) {
      delete process.env.FAIOS_DEV_AUTH_ENABLED;
    } else {
      process.env.FAIOS_DEV_AUTH_ENABLED = previousDevAuthEnabled;
    }

    if (previousEncryptionKey === undefined) {
      delete process.env.FAIOS_ENCRYPTION_KEY;
    } else {
      process.env.FAIOS_ENCRYPTION_KEY = previousEncryptionKey;
    }

    if (previousEncryptionKeyVersion === undefined) {
      delete process.env.FAIOS_ENCRYPTION_KEY_VERSION;
    } else {
      process.env.FAIOS_ENCRYPTION_KEY_VERSION = previousEncryptionKeyVersion;
    }

    await server.close();
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
