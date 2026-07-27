import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getPrismaClient } from "@faios/database";
import { encryptedJsonPayloadSchema } from "@faios/security";
import type { FounderSession } from "../lib/founder-session.js";
import { CompleteGitHubOAuthUseCase } from "../features/integrations/application/complete-github-oauth.use-case.js";
import { StartGitHubOAuthUseCase } from "../features/integrations/application/start-github-oauth.use-case.js";

const database = getPrismaClient();

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startOAuthTokenServer(expectedToken: string): Promise<{
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly requests: readonly Record<string, unknown>[];
}> {
  const requests: Record<string, unknown>[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      if (request.method !== "POST" || request.url !== "/login/oauth/access_token") {
        response.writeHead(404);
        response.end();
        return;
      }

      const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      requests.push(body);

      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          access_token: expectedToken,
          scope: "repo",
          token_type: "bearer",
        }),
      );
    })().catch(() => {
      response.writeHead(500);
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected OAuth token server to bind to a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    requests,
  };
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `github_oauth_${suffix}`;
  const token = `gho_oauth_${suffix}`;
  const tokenServer = await startOAuthTokenServer(token);
  const founderSession: FounderSession = {
    founderId,
    email: `${founderId}@faios.local`,
    displayName: "OAuth Founder",
    source: "header",
  };

  process.env.GITHUB_OAUTH_CLIENT_ID = "github_oauth_client";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "github_oauth_secret";
  process.env.GITHUB_OAUTH_TOKEN_URL = `${tokenServer.baseUrl}/login/oauth/access_token`;
  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "github-oauth-test-key").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "github-oauth-test-v1";

  try {
    const startResponse = await new StartGitHubOAuthUseCase(database).execute(
      {
        accountLabel: "OAuth GitHub",
        owner: "faios",
        repo: "atlas",
        redirectUri: "http://localhost:4000/api/v1/integrations/github/oauth/callback",
        apiBaseUrl: "https://api.github.com",
      },
      `corr_start_${suffix}`,
      founderSession,
    );
    const authorizationUrl = new URL(startResponse.authorizationUrl);

    if (authorizationUrl.searchParams.get("client_id") !== "github_oauth_client") {
      throw new Error("GitHub authorization URL did not include the configured client ID.");
    }

    if (authorizationUrl.searchParams.get("state") !== startResponse.state) {
      throw new Error("GitHub authorization URL did not include the persisted OAuth state.");
    }

    const completeResponse = await new CompleteGitHubOAuthUseCase(database).execute(
      {
        code: "oauth-code",
        state: startResponse.state,
      },
      `corr_complete_${suffix}`,
      founderSession,
    );

    if (completeResponse.connection.provider !== "github") {
      throw new Error("Expected GitHub OAuth completion to return a GitHub connection.");
    }

    const storedState = await database.integrationOAuthState.findUniqueOrThrow({
      where: {
        state: startResponse.state,
      },
    });

    if (!storedState.consumedAt) {
      throw new Error("Expected OAuth state to be marked consumed after callback.");
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
      throw new Error("Expected OAuth completion to store an encrypted credential.");
    }

    const encryptedPayload = encryptedJsonPayloadSchema.parse(
      storedConnection.credential.encryptedPayload,
    );

    if (encryptedPayload.keyVersion !== "github-oauth-test-v1") {
      throw new Error("Expected encrypted OAuth credential key version to be persisted.");
    }

    const serializedConnection = JSON.stringify(storedConnection.metadata);
    const serializedResponse = JSON.stringify(completeResponse);

    if (serializedConnection.includes(token)) {
      throw new Error("OAuth access token leaked into integration metadata.");
    }

    if (serializedResponse.includes(token)) {
      throw new Error("OAuth access token leaked into API response.");
    }

    if (tokenServer.requests.length !== 1) {
      throw new Error(`Expected one OAuth token request, received ${tokenServer.requests.length}.`);
    }
  } finally {
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await tokenServer.close();
    await database.$disconnect();
  }
}

await main();
