import { getPrismaClient } from "@faios/database";
import { encryptedJsonPayloadSchema } from "@faios/security";
import { ConnectGitHubIntegrationUseCase } from "../features/integrations/application/connect-github-integration.use-case.js";
import { ListIntegrationConnectionsUseCase } from "../features/integrations/application/list-integration-connections.use-case.js";

const database = getPrismaClient();

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `github_connection_${suffix}`;
  const token = `ghp_business_api_${suffix}`;

  process.env.DEV_FOUNDER_ID = founderId;
  process.env.DEV_FOUNDER_EMAIL = `${founderId}@faios.local`;
  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "business-api-test-key").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "business-api-test-v1";

  try {
    const connectUseCase = new ConnectGitHubIntegrationUseCase(database);
    const connectResponse = await connectUseCase.execute(
      {
        accountLabel: "Product GitHub",
        owner: "faios",
        repo: "atlas",
        accessToken: token,
        apiBaseUrl: "https://api.github.com",
      },
      `corr_${suffix}`,
    );

    if (connectResponse.connection.provider !== "github") {
      throw new Error("Expected GitHub connection response.");
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
      },
    });

    if (!storedConnection.credential) {
      throw new Error("Expected encrypted integration credential to be stored.");
    }

    const encryptedPayload = encryptedJsonPayloadSchema.parse(
      storedConnection.credential.encryptedPayload,
    );

    if (encryptedPayload.keyVersion !== "business-api-test-v1") {
      throw new Error("Expected encrypted credential key version to be persisted.");
    }

    if (JSON.stringify(storedConnection.metadata).includes(token)) {
      throw new Error("GitHub token was stored in integration metadata.");
    }

    if (JSON.stringify(connectResponse).includes(token)) {
      throw new Error("GitHub token was returned from connect response.");
    }

    const listResponse = await new ListIntegrationConnectionsUseCase(database).execute(
      `corr_list_${suffix}`,
    );

    if (listResponse.connections.length !== 1) {
      throw new Error(
        `Expected one integration connection, received ${listResponse.connections.length}.`,
      );
    }

    if (JSON.stringify(listResponse).includes(token)) {
      throw new Error("GitHub token was returned from list response.");
    }
  } finally {
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
