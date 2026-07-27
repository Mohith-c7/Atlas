import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { commandRoutes } from "../features/commands/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

function readFirstEvent(response: Response): Promise<string> {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();

  if (!reader) {
    throw new Error("Expected SSE response body to be readable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new Promise<string>((resolve, reject) => {
    const read = (): void => {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            reject(new Error("SSE stream closed before first event."));
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          if (buffer.includes("\n\n") && buffer.includes("command.execution.snapshot")) {
            resolve(buffer);
            return;
          }

          read();
        })
        .catch(reject);
    };

    read();
  }).finally(() => {
    void reader.cancel();
  });
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `execution_events_${suffix}`;
  const server = Fastify();

  process.env.DEV_FOUNDER_ID = founderId;
  process.env.DEV_FOUNDER_EMAIL = `${founderId}@faios.local`;

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(commandRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderId,
        email: `${founderId}@faios.local`,
        commands: {
          create: {
            source: "CHAT",
            rawInput: "Create a GitHub issue for onboarding",
            status: "COMPLETED",
            summary: "Created a GitHub issue.",
          },
        },
      },
    });

    await server.listen({
      host: "127.0.0.1",
      port: 0,
    });

    const address = server.server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected Fastify server to bind to a TCP port.");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/commands/executions/events`,
    );

    if (!response.ok || response.headers.get("content-type") !== "text/event-stream") {
      throw new Error(`Expected SSE response, received ${response.status}.`);
    }

    const eventText = await readFirstEvent(response);

    if (!eventText.includes("command.execution.snapshot")) {
      throw new Error("Expected command execution snapshot event.");
    }

    if (!eventText.includes("Created a GitHub issue.")) {
      throw new Error("Expected SSE payload to include founder command execution state.");
    }
  } finally {
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
