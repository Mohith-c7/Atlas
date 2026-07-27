import { spawn, type ChildProcess } from "node:child_process";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import amqp, { type Channel } from "amqplib";
import {
  executionDispatchExchange,
  executionDispatchQueue,
  executionDispatchRoutingKey,
  executionDispatchMessageSchema,
} from "@faios/contracts";

const suffix = Date.now().toString(36);
const aiPort = 18_000 + Math.floor(Math.random() * 1_000);
const founderId = `github_e2e_${suffix}`;
const githubToken = `ghp_e2e_${suffix}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://faios:faios@localhost:5432/faios_integration?schema=public";
const rabbitMqUrl = process.env.RABBITMQ_URL ?? "amqp://faios:faios@localhost:5672";

process.env.DATABASE_URL = databaseUrl;
process.env.RABBITMQ_URL = rabbitMqUrl;
process.env.AI_ORCHESTRATOR_URL = `http://127.0.0.1:${aiPort}`;
process.env.EXECUTION_DISPATCH_ENABLED = "true";
process.env.DEV_FOUNDER_ID = founderId;
process.env.DEV_FOUNDER_EMAIL = `${founderId}@faios.local`;
process.env.FAIOS_ENCRYPTION_KEY =
  process.env.FAIOS_ENCRYPTION_KEY ?? Buffer.alloc(32, "github-e2e-key").toString("base64");
process.env.FAIOS_ENCRYPTION_KEY_VERSION = process.env.FAIOS_ENCRYPTION_KEY_VERSION ?? "e2e-v1";

type FakeGitHubRequest = {
  readonly authorization: string;
  readonly body: unknown;
};

type FakeGitHubServer = {
  readonly baseUrl: string;
  readonly requests: FakeGitHubRequest[];
  close(): Promise<void>;
};

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function startFakeGitHubServer(): Promise<FakeGitHubServer> {
  const requests: FakeGitHubRequest[] = [];
  const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      if (request.method !== "POST" || request.url !== "/repos/faios/atlas/issues") {
        response.statusCode = 404;
        response.end("not found");
        return;
      }

      const body = await readRequestBody(request);
      requests.push({
        authorization: request.headers.authorization ?? "",
        body: body ? (JSON.parse(body) as unknown) : undefined,
      });

      response.setHeader("content-type", "application/json");
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          id: 987_654,
          number: 77,
          html_url: "http://fake.github.local/faios/atlas/issues/77",
          state: "open",
          title: "the onboarding bug",
        }),
      );
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "fake github failure");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine fake GitHub server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function startAiOrchestrator(): ChildProcess {
  return spawn(
    "python",
    [
      "-m",
      "uvicorn",
      "faios_ai_orchestrator.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(aiPort),
      "--app-dir",
      "services/ai-orchestrator/src",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
      windowsHide: true,
    },
  );
}

async function waitForAiOrchestrator(processHandle: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`AI Orchestrator exited early with code ${processHandle.exitCode}.`);
    }

    try {
      const response = await fetch(`${process.env.AI_ORCHESTRATOR_URL}/internal/v1/commands/plan`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          commandId: "smoke_probe",
          founderId,
          source: "chat",
          input: "Create a GitHub issue for the smoke probe",
          correlationId: `corr_probe_${suffix}`,
          availableCapabilities: [
            {
              key: "repository.createIssue",
              provider: "github",
              label: "Create repository issues",
              description: "Create GitHub issues.",
              requiresApproval: true,
              status: "available",
            },
          ],
        }),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for AI Orchestrator.");
}

async function prepareRabbitQueue(channel: Channel): Promise<void> {
  await channel.assertExchange(executionDispatchExchange, "direct", {
    durable: true,
  });
  await channel.assertQueue(executionDispatchQueue, {
    durable: true,
  });
  await channel.bindQueue(
    executionDispatchQueue,
    executionDispatchExchange,
    executionDispatchRoutingKey,
  );
  await channel.purgeQueue(executionDispatchQueue);
}

async function receiveDispatchMessage(channel: Channel) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const message = await channel.get(executionDispatchQueue, {
      noAck: false,
    });

    if (message) {
      const parsed = executionDispatchMessageSchema.parse(
        JSON.parse(message.content.toString("utf8")) as unknown,
      );
      channel.ack(message);
      return parsed;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for RabbitMQ dispatch message.");
}

async function main() {
  const fakeGitHub = await startFakeGitHubServer();
  const aiProcess = startAiOrchestrator();
  const databaseModule = await import("../../packages/database/src/index.js");
  const integrationsModule =
    await import("../../services/business-api/src/features/integrations/application/connect-github-integration.use-case.js");
  const commandsModule =
    await import("../../services/business-api/src/features/commands/application/create-command.use-case.js");
  const approvalsModule =
    await import("../../services/business-api/src/features/approvals/application/list-approvals.use-case.js");
  const decisionModule =
    await import("../../services/business-api/src/features/approvals/application/decide-approval.use-case.js");
  const executionRepositoryModule =
    await import("../../services/workers/src/execution/execution.repository.js");
  const executionWorkerModule =
    await import("../../services/workers/src/execution/execution-worker.js");
  const registryExecutorModule =
    await import("../../services/workers/src/execution/registry-mcp-tool-executor.js");
  const credentialResolverModule =
    await import("../../services/workers/src/execution/database-mcp-credential-resolver.js");
  const mcpModule = await import("../../packages/mcp/src/index.js");

  const database = databaseModule.getPrismaClient();
  const rabbitConnection = await amqp.connect(rabbitMqUrl);
  const rabbitChannel = await rabbitConnection.createChannel();

  try {
    await waitForAiOrchestrator(aiProcess);
    await prepareRabbitQueue(rabbitChannel);

    await new integrationsModule.ConnectGitHubIntegrationUseCase(database).execute(
      {
        accountLabel: "Smoke GitHub",
        owner: "faios",
        repo: "atlas",
        accessToken: githubToken,
        apiBaseUrl: fakeGitHub.baseUrl,
      },
      `corr_connect_${suffix}`,
    );

    const commandResponse = await new commandsModule.CreateCommandUseCase(database).execute({
      request: {
        input: "Create a GitHub issue for the onboarding bug",
        source: "chat",
      },
      correlationId: `corr_command_${suffix}`,
    });

    if (commandResponse.status !== "awaiting_approval") {
      throw new Error(`Expected awaiting_approval, received ${commandResponse.status}.`);
    }

    const approvals = await new approvalsModule.ListApprovalsUseCase(database).execute();
    const approval = approvals.approvals.find(
      (item) => item.commandId === commandResponse.commandId,
    );

    if (!approval) {
      throw new Error("Expected pending approval for GitHub command.");
    }

    await new decisionModule.DecideApprovalUseCase(database).execute(
      approval.id,
      "APPROVED",
      `corr_approve_${suffix}`,
    );

    const dispatchMessage = await receiveDispatchMessage(rabbitChannel);
    const registry = mcpModule.createDefaultMcpAdapterRegistry({
      credentialResolver: new credentialResolverModule.DatabaseMcpCredentialResolver(database),
      includeRealProviderAdapters: true,
    });
    const worker = new executionWorkerModule.ExecutionWorker(
      new executionRepositoryModule.ExecutionRepository(database),
      new registryExecutorModule.RegistryMcpToolExecutor(registry),
      {
        info: () => undefined,
      },
    );
    const workerResult = await worker.runInvocation(dispatchMessage.invocationId);

    if (!workerResult.processed || workerResult.status !== "succeeded") {
      throw new Error(`Expected worker success, received ${JSON.stringify(workerResult)}.`);
    }

    if (fakeGitHub.requests.length !== 1) {
      throw new Error(`Expected one fake GitHub request, received ${fakeGitHub.requests.length}.`);
    }

    const fakeRequest = fakeGitHub.requests[0];

    if (fakeRequest?.authorization !== `Bearer ${githubToken}`) {
      throw new Error("GitHub adapter did not send the decrypted runtime credential.");
    }

    const invocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: dispatchMessage.invocationId,
      },
    });

    if (invocation.status !== "SUCCEEDED") {
      throw new Error(`Expected SUCCEEDED invocation, received ${invocation.status}.`);
    }

    const responsePayload = JSON.stringify(invocation.responsePayload);

    if (!responsePayload.includes("http://fake.github.local/faios/atlas/issues/77")) {
      throw new Error("Invocation response did not persist the fake GitHub issue URL.");
    }

    if (responsePayload.includes(githubToken)) {
      throw new Error("GitHub token leaked into persisted response payload.");
    }
  } finally {
    await rabbitChannel.close().catch(() => undefined);
    await rabbitConnection.close().catch(() => undefined);
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
    await fakeGitHub.close().catch(() => undefined);
    aiProcess.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
