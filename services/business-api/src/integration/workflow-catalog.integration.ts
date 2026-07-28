import Fastify from "fastify";
import { listFounderWorkflowsResponseSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { ConnectGitHubIntegrationUseCase } from "../features/integrations/application/connect-github-integration.use-case.js";
import { workflowRoutes } from "../features/workflows/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type WorkflowCatalogResponse = {
  readonly workflows?: readonly {
    readonly id?: string;
    readonly readinessStatus?: string;
    readonly implementationStatus?: string;
  }[];
};

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `workflow_catalog_${suffix}`;
  const rawToken = `faios_workflow_catalog_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const previousEncryptionKey = process.env.FAIOS_ENCRYPTION_KEY;
  const previousEncryptionKeyVersion = process.env.FAIOS_ENCRYPTION_KEY_VERSION;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";
  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "workflow-catalog-test").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "workflow-catalog-test-v1";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(workflowRoutes);

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

    const initialResponse = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (initialResponse.statusCode !== 200) {
      throw new Error(
        `Expected initial workflow catalog 200, received ${initialResponse.statusCode}.`,
      );
    }

    const initialCatalog: WorkflowCatalogResponse = listFounderWorkflowsResponseSchema.parse(
      initialResponse.json(),
    );
    assertUniqueWorkflowIds(initialCatalog);
    const initialGithubIssue = initialCatalog.workflows?.find(
      (workflow) => workflow.id === "github.create_issue",
    );
    const initialGithubStatus = initialCatalog.workflows?.find(
      (workflow) => workflow.id === "github.repository_status",
    );
    const plannedCalendar = initialCatalog.workflows?.find(
      (workflow) => workflow.id === "calendar.schedule_meeting",
    );

    if (
      initialGithubIssue?.readinessStatus !== "not_connected" ||
      initialGithubStatus?.readinessStatus !== "not_connected" ||
      plannedCalendar?.readinessStatus !== "planned"
    ) {
      throw new Error(
        "Expected live GitHub workflows to wait for connection and planned calendar workflow to remain planned.",
      );
    }

    await new ConnectGitHubIntegrationUseCase(database).execute(
      {
        accountLabel: "Workflow GitHub",
        owner: "faios",
        repo: "atlas",
        accessToken: `ghp_workflow_${suffix}`,
        apiBaseUrl: "https://api.github.com",
      },
      `corr_workflow_connect_${suffix}`,
      {
        founderId,
        email: `${founderId}@faios.local`,
        displayName: "Workflow Founder",
        source: "session",
      },
    );

    const connectedResponse = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (connectedResponse.statusCode !== 200) {
      throw new Error(
        `Expected connected workflow catalog 200, received ${connectedResponse.statusCode}.`,
      );
    }

    const connectedCatalog: WorkflowCatalogResponse = listFounderWorkflowsResponseSchema.parse(
      connectedResponse.json(),
    );
    assertUniqueWorkflowIds(connectedCatalog);
    const connectedGithubIssue = connectedCatalog.workflows?.find(
      (workflow) => workflow.id === "github.create_issue",
    );
    const connectedGithubStatus = connectedCatalog.workflows?.find(
      (workflow) => workflow.id === "github.repository_status",
    );

    if (
      connectedGithubIssue?.readinessStatus !== "ready" ||
      connectedGithubStatus?.readinessStatus !== "ready"
    ) {
      throw new Error("Expected live GitHub workflows to become ready after connection.");
    }

    await database.integrationConnection.updateMany({
      where: {
        founderId,
        provider: "github",
      },
      data: {
        lastHealthStatus: "unhealthy",
        lastHealthMessage: "GitHub token was revoked.",
      },
    });

    const unhealthyResponse = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (unhealthyResponse.statusCode !== 200) {
      throw new Error(
        `Expected unhealthy workflow catalog 200, received ${unhealthyResponse.statusCode}.`,
      );
    }

    const unhealthyCatalog: WorkflowCatalogResponse = listFounderWorkflowsResponseSchema.parse(
      unhealthyResponse.json(),
    );
    const unhealthyGithubIssue = unhealthyCatalog.workflows?.find(
      (workflow) => workflow.id === "github.create_issue",
    );
    const unhealthyGithubStatus = unhealthyCatalog.workflows?.find(
      (workflow) => workflow.id === "github.repository_status",
    );

    if (
      unhealthyGithubIssue?.readinessStatus !== "not_connected" ||
      unhealthyGithubStatus?.readinessStatus !== "not_connected"
    ) {
      throw new Error("Expected unhealthy GitHub workflows to stop reporting ready.");
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

function assertUniqueWorkflowIds(catalog: WorkflowCatalogResponse) {
  const ids = catalog.workflows?.map((workflow) => workflow.id).filter(Boolean) ?? [];
  const uniqueIds = new Set(ids);

  if (ids.length !== uniqueIds.size) {
    throw new Error(`Expected unique workflow ids, received ${ids.join(", ")}.`);
  }
}

await main();
