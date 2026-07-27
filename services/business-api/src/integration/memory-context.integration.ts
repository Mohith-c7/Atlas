import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getPrismaClient } from "@faios/database";
import { CreateCommandUseCase } from "../features/commands/application/create-command.use-case.js";
import type { FounderSession } from "../lib/founder-session.js";

const database = getPrismaClient();

type PlanningRequest = {
  readonly memoryContext?: readonly {
    readonly content: string;
  }[];
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startPlanningServer(): Promise<{
  readonly baseUrl: string;
  readonly requests: PlanningRequest[];
  readonly close: () => Promise<void>;
}> {
  const requests: PlanningRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      if (request.method !== "POST" || request.url !== "/internal/v1/commands/plan") {
        response.writeHead(404);
        response.end();
        return;
      }

      const payload = JSON.parse(await readBody(request)) as PlanningRequest & {
        commandId: string;
      };
      requests.push(payload);

      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          commandId: payload.commandId,
          status: "completed",
          summary: "Memory context accepted.",
          steps: [],
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
    throw new Error("Expected planning server to bind to a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
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
  };
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `memory_context_${suffix}`;
  const planningServer = await startPlanningServer();
  const founderSession: FounderSession = {
    founderId,
    email: `${founderId}@faios.local`,
    displayName: "Memory Founder",
    source: "header",
  };

  process.env.AI_ORCHESTRATOR_URL = planningServer.baseUrl;

  try {
    const useCase = new CreateCommandUseCase(database);

    await useCase.execute({
      request: {
        source: "chat",
        input: "Remember that our company is Atlas AI.",
      },
      correlationId: `corr_memory_write_${suffix}`,
      founderSession,
    });

    const storedMemories = await database.memoryItem.findMany({
      where: {
        founderId,
      },
    });

    if (storedMemories.length !== 1) {
      throw new Error(`Expected one stored memory item, received ${storedMemories.length}.`);
    }

    if (storedMemories[0]?.content !== "Company is: Atlas AI") {
      throw new Error(`Unexpected memory content: ${storedMemories[0]?.content}.`);
    }

    await useCase.execute({
      request: {
        source: "chat",
        input: "Create a GitHub issue for onboarding polish.",
      },
      correlationId: `corr_memory_read_${suffix}`,
      founderSession,
    });

    const secondPlanningRequest = planningServer.requests[1];
    const serializedRequest = JSON.stringify(secondPlanningRequest);

    if (!serializedRequest.includes("Company is: Atlas AI")) {
      throw new Error("Expected stored founder memory to be injected into planning request.");
    }

    if (serializedRequest.includes("secret") || serializedRequest.includes("token")) {
      throw new Error("Unexpected sensitive text leaked into memory context.");
    }
  } finally {
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await planningServer.close();
    await database.$disconnect();
  }
}

await main();
