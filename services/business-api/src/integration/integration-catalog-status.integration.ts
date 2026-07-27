import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { integrationRoutes } from "../features/integrations/index.js";
import { ConnectGitHubIntegrationUseCase } from "../features/integrations/application/connect-github-integration.use-case.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type CatalogResponse = {
  readonly integrations?: readonly {
    readonly provider?: string;
    readonly status?: string;
    readonly connection?: {
      readonly status?: string;
    } | null;
  }[];
};

type ProviderStatusResponse = {
  readonly provider?: {
    readonly provider?: string;
    readonly connected?: boolean;
    readonly capabilities?: readonly {
      readonly capabilityKey?: string;
      readonly status?: string;
      readonly reason?: string;
    }[];
  };
};

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `integration_catalog_${suffix}`;
  const rawToken = `faios_integration_catalog_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const previousEncryptionKey = process.env.FAIOS_ENCRYPTION_KEY;
  const previousEncryptionKeyVersion = process.env.FAIOS_ENCRYPTION_KEY_VERSION;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";
  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "catalog-status-test").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "catalog-status-test-v1";

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

    const initialStatusResponse = await server.inject({
      method: "GET",
      url: "/api/v1/integrations/providers/github/status",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (initialStatusResponse.statusCode !== 200) {
      throw new Error(
        `Expected initial provider status 200, received ${initialStatusResponse.statusCode}.`,
      );
    }

    const initialStatus: ProviderStatusResponse = initialStatusResponse.json();
    const initialGithubReadiness = initialStatus.provider?.capabilities?.find(
      (capability) => capability.capabilityKey === "repository.createIssue",
    );

    if (
      initialStatus.provider?.connected !== false ||
      initialGithubReadiness?.status !== "not_ready"
    ) {
      throw new Error("Expected GitHub provider to be not ready before connection.");
    }

    await new ConnectGitHubIntegrationUseCase(database).execute(
      {
        accountLabel: "Catalog GitHub",
        owner: "faios",
        repo: "atlas",
        accessToken: `ghp_catalog_${suffix}`,
        apiBaseUrl: "https://api.github.com",
      },
      `corr_catalog_connect_${suffix}`,
      {
        founderId,
        email: `${founderId}@faios.local`,
        displayName: "Catalog Founder",
        source: "session",
      },
    );

    const catalogResponse = await server.inject({
      method: "GET",
      url: "/api/v1/integrations/catalog",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (catalogResponse.statusCode !== 200) {
      throw new Error(`Expected catalog 200, received ${catalogResponse.statusCode}.`);
    }

    const catalog: CatalogResponse = catalogResponse.json();
    const githubCatalogItem = catalog.integrations?.find((item) => item.provider === "github");

    if (!githubCatalogItem || githubCatalogItem.connection?.status !== "connected") {
      throw new Error("Expected integration catalog to include connected GitHub.");
    }

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
    const connectedGithubReadiness = connectedStatus.provider?.capabilities?.find(
      (capability) => capability.capabilityKey === "repository.createIssue",
    );

    if (
      connectedStatus.provider?.connected !== true ||
      connectedGithubReadiness?.status !== "ready"
    ) {
      throw new Error("Expected GitHub provider to be ready after connection.");
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
