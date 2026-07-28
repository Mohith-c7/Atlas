import {
  GitHubCreateIssueAdapter,
  GitHubRepositoryStatusAdapter,
  McpAdapterRegistry,
  type FetchLike,
} from "@faios/mcp";
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

  const observedAuthorizationHeaders: string[] = [];
  let observedIssueRequestBody: unknown;

  const fakeFetch: FetchLike = (input, init) => {
    observedAuthorizationHeaders.push(init?.headers?.Authorization ?? "");

    if (input === "https://api.github.test/repos/faios/atlas/issues") {
      observedIssueRequestBody = init?.body ? (JSON.parse(init.body) as unknown) : undefined;

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
    }

    if (input === "https://api.github.test/repos/faios/atlas") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            full_name: "faios/atlas",
            html_url: "https://github.test/faios/atlas",
            description: "Founder AI Operating System",
            default_branch: "main",
            open_issues_count: 7,
            stargazers_count: 11,
            forks_count: 2,
            pushed_at: "2026-07-28T10:00:00Z",
          }),
        text: () => Promise.resolve(""),
      });
    }

    if (input === "https://api.github.test/repos/faios/atlas/issues?state=open&per_page=5") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            {
              number: 42,
              title: "Create founder onboarding issue",
              html_url: "https://github.test/faios/atlas/issues/42",
              state: "open",
              updated_at: "2026-07-28T10:00:00Z",
            },
          ]),
        text: () => Promise.resolve(""),
      });
    }

    if (input === "https://api.github.test/repos/faios/atlas/pulls?state=open&per_page=5") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            {
              number: 9,
              title: "Harden workflow catalog",
              html_url: "https://github.test/faios/atlas/pull/9",
              state: "open",
              updated_at: "2026-07-28T11:00:00Z",
            },
          ]),
        text: () => Promise.resolve(""),
      });
    }

    throw new Error(`Unexpected GitHub endpoint: ${input}`);
  };

  try {
    const integrationConnection = await database.integrationConnection.create({
      data: {
        founderId: founder.id,
        provider: "github",
        accountLabel: "FAIOS GitHub",
        status: "connected",
        capabilityKeys: ["repository.createIssue", "repository.summarizeStatus"],
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

    const registry = new McpAdapterRegistry();
    const credentialResolver = new DatabaseMcpCredentialResolver(database, encryptionKey);
    registry.register(new GitHubCreateIssueAdapter(credentialResolver, fakeFetch));
    registry.register(new GitHubRepositoryStatusAdapter(credentialResolver, fakeFetch));
    const worker = new ExecutionWorker(
      new ExecutionRepository(database),
      new RegistryMcpToolExecutor(registry),
      logger,
    );

    const readiness = await registry.listReadiness(founder.id);
    const createIssueReadiness = readiness.find(
      (item) => item.capabilityKey === "repository.createIssue",
    );
    const repositoryStatusReadiness = readiness.find(
      (item) => item.capabilityKey === "repository.summarizeStatus",
    );

    if (createIssueReadiness?.status !== "ready" || repositoryStatusReadiness?.status !== "ready") {
      throw new Error(`Expected GitHub adapter readiness, received ${JSON.stringify(readiness)}.`);
    }

    const invocation = await createGitHubIssueInvocation(founder.id, suffix, {
      accessToken: "must-be-redacted-before-adapter",
    });
    const result = await worker.runInvocation(invocation.id);

    if (!result.processed || result.status !== "succeeded") {
      throw new Error(`Expected successful GitHub execution, received ${JSON.stringify(result)}.`);
    }

    if (!observedAuthorizationHeaders.includes(`Bearer ${githubAccessToken}`)) {
      throw new Error("GitHub adapter did not receive the decrypted access token at runtime.");
    }

    if (JSON.stringify(observedIssueRequestBody).includes("must-be-redacted-before-adapter")) {
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

    const statusInvocation = await createGitHubStatusInvocation(founder.id);
    const statusResult = await worker.runInvocation(statusInvocation.id);

    if (!statusResult.processed || statusResult.status !== "succeeded") {
      throw new Error(
        `Expected successful GitHub status execution, received ${JSON.stringify(statusResult)}.`,
      );
    }

    const completedStatusInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: statusInvocation.id,
      },
    });

    const statusPayload = JSON.stringify(completedStatusInvocation.responsePayload);

    if (
      !statusPayload.includes("faios/atlas") ||
      !statusPayload.includes("open pull requests") ||
      statusPayload.includes(githubAccessToken)
    ) {
      throw new Error("GitHub repository status payload was not persisted safely.");
    }

    await database.integrationConnection.update({
      where: {
        id: integrationConnection.id,
      },
      data: {
        status: "disconnected",
        statusReason: "Founder disconnected GitHub.",
      },
    });

    const disconnectedInvocation = await createGitHubIssueInvocation(founder.id, suffix);
    const disconnectedResult = await worker.runInvocation(disconnectedInvocation.id);

    if (!disconnectedResult.processed || disconnectedResult.status !== "failed") {
      throw new Error(
        `Expected disconnected GitHub execution to fail, received ${JSON.stringify(
          disconnectedResult,
        )}.`,
      );
    }

    const failedDisconnectedInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: disconnectedInvocation.id,
      },
    });

    if (failedDisconnectedInvocation.errorCode !== "MCP_INTEGRATION_DISCONNECTED") {
      throw new Error(
        `Expected disconnected credential denial, received ${failedDisconnectedInvocation.errorCode}.`,
      );
    }

    await database.integrationConnection.update({
      where: {
        id: integrationConnection.id,
      },
      data: {
        status: "connected",
        statusReason: null,
        lastHealthStatus: "unhealthy",
        lastHealthMessage: "GitHub OAuth token was revoked by the provider.",
      },
    });

    const unhealthyReadiness = await registry.listReadiness(founder.id);
    const unhealthyCreateIssueReadiness = unhealthyReadiness.find(
      (item) => item.capabilityKey === "repository.createIssue",
    );
    const unhealthyRepositoryStatusReadiness = unhealthyReadiness.find(
      (item) => item.capabilityKey === "repository.summarizeStatus",
    );

    if (
      unhealthyCreateIssueReadiness?.status !== "not_ready" ||
      unhealthyRepositoryStatusReadiness?.status !== "not_ready" ||
      !unhealthyCreateIssueReadiness?.reason.includes("revoked") ||
      !unhealthyRepositoryStatusReadiness?.reason.includes("revoked")
    ) {
      throw new Error(
        `Expected unhealthy GitHub readiness, received ${JSON.stringify(unhealthyReadiness)}.`,
      );
    }

    const unhealthyInvocation = await createGitHubIssueInvocation(founder.id, suffix);
    const unhealthyResult = await worker.runInvocation(unhealthyInvocation.id);

    if (
      !unhealthyResult.processed ||
      !["failed", "retry_scheduled"].includes(unhealthyResult.status)
    ) {
      throw new Error(
        `Expected unhealthy GitHub execution to fail or retry, received ${JSON.stringify(
          unhealthyResult,
        )}.`,
      );
    }

    const failedUnhealthyInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: unhealthyInvocation.id,
      },
    });

    if (failedUnhealthyInvocation.errorCode !== "MCP_PROVIDER_HEALTH_FAILED") {
      throw new Error(
        `Expected provider health denial, received ${failedUnhealthyInvocation.errorCode}.`,
      );
    }

    const expiredCredentialPayload = encryptJsonPayload(
      {
        accessToken: `ghp_expired_${suffix}`,
        owner: "faios",
        repo: "atlas",
        apiBaseUrl: "https://api.github.test",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      encryptionKey,
    );

    await database.integrationConnection.update({
      where: {
        id: integrationConnection.id,
      },
      data: {
        lastHealthStatus: null,
        lastHealthMessage: null,
        credential: {
          update: {
            encryptedPayload: expiredCredentialPayload,
            keyVersion: expiredCredentialPayload.keyVersion,
          },
        },
      },
    });

    const expiredInvocation = await createGitHubIssueInvocation(founder.id, suffix);
    const expiredResult = await worker.runInvocation(expiredInvocation.id);

    if (!expiredResult.processed || expiredResult.status !== "failed") {
      throw new Error(
        `Expected expired GitHub execution to fail, received ${JSON.stringify(expiredResult)}.`,
      );
    }

    const failedExpiredInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: expiredInvocation.id,
      },
    });

    if (failedExpiredInvocation.errorCode !== "MCP_CREDENTIALS_EXPIRED") {
      throw new Error(
        `Expected expired credential denial, received ${failedExpiredInvocation.errorCode}.`,
      );
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

async function createGitHubIssueInvocation(
  founderId: string,
  suffix: string,
  extraPayload: Record<string, unknown> = {},
) {
  const command = await database.command.create({
    data: {
      founderId,
      source: "CHAT",
      rawInput: "Create a GitHub issue for onboarding",
      status: "EXECUTING",
      summary: "Create a GitHub issue",
    },
  });

  return database.toolInvocation.create({
    data: {
      commandId: command.id,
      capabilityKey: "repository.createIssue",
      provider: "github",
      status: "PENDING",
      requestPayload: {
        title: "Create founder onboarding issue",
        body: "Track onboarding polish for the founder command flow.",
        labels: ["product", "onboarding"],
        ...extraPayload,
      },
    },
  });
}

async function createGitHubStatusInvocation(founderId: string) {
  const command = await database.command.create({
    data: {
      founderId,
      source: "CHAT",
      rawInput: "Summarize GitHub repository status",
      status: "EXECUTING",
      summary: "Summarize GitHub repository status",
    },
  });

  return database.toolInvocation.create({
    data: {
      commandId: command.id,
      capabilityKey: "repository.summarizeStatus",
      provider: "github",
      status: "PENDING",
      requestPayload: {
        includeIssues: true,
        includePullRequests: true,
        itemLimit: 5,
      },
    },
  });
}

await main();
