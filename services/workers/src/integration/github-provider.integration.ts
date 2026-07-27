import { GitHubCreateIssueAdapter, McpAdapterRegistry, type FetchLike } from "@faios/mcp";
import { getPrismaClient } from "@faios/database";
import { encryptJsonPayload, parseBase64EncryptionKey } from "@faios/security";
import { ExecutionRepository } from "../execution/execution.repository.js";
import { ExecutionWorker } from "../execution/execution-worker.js";
import { RegistryMcpToolExecutor } from "../execution/registry-mcp-tool-executor.js";
import { DatabaseMcpCredentialResolver } from "../execution/database-mcp-credential-resolver.js";

const database = getPrismaClient();

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function main() {
  const suffix = Date.now().toString(36);
  const encryptionKey = parseBase64EncryptionKey(
    "integration-v1",
    Buffer.alloc(32, "github-adapter-test-key").toString("base64"),
  );
  const githubAccessToken = `ghp_integration_${suffix}`;
  const encryptedPayload = encryptJsonPayload(
    {
      accessToken: githubAccessToken,
      owner: "faios",
      repo: "atlas",
      apiBaseUrl: "https://api.github.test",
    },
    encryptionKey,
  );

  const founder = await database.founderAccount.create({
    data: {
      email: `github-${suffix}@faios.local`,
      displayName: "GitHub Integration Founder",
    },
  });

  let observedAuthorizationHeader = "";
  let observedRequestBody: unknown;

  const fakeFetch: FetchLike = (input, init) => {
    if (input !== "https://api.github.test/repos/faios/atlas/issues") {
      throw new Error(`Unexpected GitHub endpoint: ${input}`);
    }

    observedAuthorizationHeader = init?.headers?.Authorization ?? "";
    observedRequestBody = init?.body ? (JSON.parse(init.body) as unknown) : undefined;

    return Promise.resolve({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: 123456,
          number: 42,
          html_url: "https://github.test/faios/atlas/issues/42",
          state: "open",
          title: "Create founder onboarding issue",
        }),
      text: () => Promise.resolve(""),
    });
  };

  try {
    await database.integrationConnection.create({
      data: {
        founderId: founder.id,
        provider: "github",
        accountLabel: "FAIOS GitHub",
        status: "connected",
        capabilityKeys: ["repository.createIssue"],
        metadata: {
          installation: "integration-test",
        },
        credential: {
          create: {
            encryptedPayload,
            keyVersion: encryptedPayload.keyVersion,
          },
        },
      },
    });

    const command = await database.command.create({
      data: {
        founderId: founder.id,
        source: "CHAT",
        rawInput: "Create a GitHub issue for onboarding",
        status: "EXECUTING",
        summary: "Create a GitHub issue",
      },
    });

    const invocation = await database.toolInvocation.create({
      data: {
        commandId: command.id,
        capabilityKey: "repository.createIssue",
        provider: "github",
        status: "PENDING",
        requestPayload: {
          title: "Create founder onboarding issue",
          body: "Track onboarding polish for the founder command flow.",
          labels: ["product", "onboarding"],
          accessToken: "must-be-redacted-before-adapter",
        },
      },
    });

    const registry = new McpAdapterRegistry();
    registry.register(
      new GitHubCreateIssueAdapter(
        new DatabaseMcpCredentialResolver(database, encryptionKey),
        fakeFetch,
      ),
    );

    const readiness = await registry.listReadiness(founder.id);

    if (readiness[0]?.status !== "ready") {
      throw new Error(`Expected GitHub adapter readiness, received ${JSON.stringify(readiness)}.`);
    }

    const worker = new ExecutionWorker(
      new ExecutionRepository(database),
      new RegistryMcpToolExecutor(registry),
      logger,
    );
    const result = await worker.runInvocation(invocation.id);

    if (!result.processed || result.status !== "succeeded") {
      throw new Error(`Expected successful GitHub execution, received ${JSON.stringify(result)}.`);
    }

    if (observedAuthorizationHeader !== `Bearer ${githubAccessToken}`) {
      throw new Error("GitHub adapter did not receive the decrypted access token at runtime.");
    }

    if (JSON.stringify(observedRequestBody).includes("must-be-redacted-before-adapter")) {
      throw new Error("Sensitive request payload reached the GitHub adapter transport.");
    }

    const updatedInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: invocation.id,
      },
    });

    if (updatedInvocation.status !== "SUCCEEDED") {
      throw new Error(`Expected invocation SUCCEEDED, received ${updatedInvocation.status}.`);
    }

    const storedPayload = JSON.stringify(updatedInvocation.responsePayload);

    if (storedPayload.includes(githubAccessToken)) {
      throw new Error("GitHub access token was persisted in the invocation response payload.");
    }

    if (!storedPayload.includes("https://github.test/faios/atlas/issues/42")) {
      throw new Error("GitHub issue response payload did not include the created issue URL.");
    }
  } finally {
    await database.founderAccount.delete({
      where: {
        id: founder.id,
      },
    });
    await database.$disconnect();
  }
}

await main();
