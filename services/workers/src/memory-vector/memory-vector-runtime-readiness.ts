import amqp from "amqplib";
import type { PrismaClient } from "@faios/database";

type ReadinessLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

type ReadinessCheckResult = {
  readonly name: string;
  readonly status: "ok" | "failed" | "skipped";
  readonly reason?: string;
};

type MemoryVectorRuntimeReadinessInput = {
  readonly database: PrismaClient;
  readonly logger: ReadinessLogger;
  readonly memoryVectorRuntimeEnabled: boolean;
  readonly rabbitMqConsumerEnabled: boolean;
  readonly rabbitMqUrl?: string;
};

export async function assertMemoryVectorRuntimeReady(
  input: MemoryVectorRuntimeReadinessInput,
): Promise<ReadonlyArray<ReadinessCheckResult>> {
  const results: ReadinessCheckResult[] = [];

  if (!input.memoryVectorRuntimeEnabled) {
    const result: ReadinessCheckResult = {
      name: "memory-vector-runtime",
      status: "skipped",
      reason: "Memory vector worker runtime is disabled.",
    };
    input.logger.info(result, "Memory vector runtime readiness skipped");
    return [result];
  }

  results.push(await runReadinessCheck("database", () => checkDatabase(input.database)));
  results.push(await runReadinessCheck("embedding-provider", checkEmbeddingProviderConfiguration));
  results.push(await runReadinessCheck("qdrant", checkQdrantReachability));

  if (input.rabbitMqConsumerEnabled) {
    results.push(
      await runReadinessCheck("rabbitmq", async () => {
        if (!input.rabbitMqUrl) {
          throw new Error(
            "RABBITMQ_URL is required when WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED=true.",
          );
        }

        const connection = await amqp.connect(input.rabbitMqUrl);
        await connection.close();
      }),
    );
  } else {
    results.push({
      name: "rabbitmq",
      status: "skipped",
      reason: "RabbitMQ memory vector consumer is disabled.",
    });
  }

  const failedResults = results.filter((result) => result.status === "failed");

  if (failedResults.length > 0) {
    input.logger.error(
      {
        checks: results,
      },
      "Memory vector runtime readiness failed",
    );
    throw new Error(
      `Memory vector runtime readiness failed: ${failedResults
        .map((result) => result.name)
        .join(", ")}.`,
    );
  }

  input.logger.info(
    {
      checks: results,
    },
    "Memory vector runtime readiness passed",
  );

  return results;
}

async function runReadinessCheck(
  name: string,
  check: () => Promise<void> | void,
): Promise<ReadinessCheckResult> {
  try {
    await check();

    return {
      name,
      status: "ok",
    };
  } catch (error) {
    return {
      name,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown readiness error.",
    };
  }
}

async function checkDatabase(database: PrismaClient): Promise<void> {
  await database.$queryRaw`SELECT 1`;
}

function checkEmbeddingProviderConfiguration(): void {
  const provider = process.env.MEMORY_EMBEDDING_PROVIDER ?? "auto";

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when MEMORY_EMBEDDING_PROVIDER=openai.");
  }

  if (!["auto", "deterministic", "openai"].includes(provider)) {
    throw new Error(`Unsupported MEMORY_EMBEDDING_PROVIDER value: ${provider}.`);
  }
}

async function checkQdrantReachability(): Promise<void> {
  const baseUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
  const response = await fetch(`${baseUrl}/collections`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Qdrant readiness failed with status ${response.status}.`);
  }
}
