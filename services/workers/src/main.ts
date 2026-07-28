import { createLogger } from "@faios/logger";
import { getPrismaClient } from "@faios/database";
import { ExecutionRepository } from "./execution/execution.repository.js";
import { ExecutionWorker } from "./execution/execution-worker.js";
import { ExecutionPollingLoop } from "./execution/execution-polling-loop.js";
import { RabbitMqExecutionConsumer } from "./execution/rabbitmq-execution-consumer.js";
import { RegistryMcpToolExecutor } from "./execution/registry-mcp-tool-executor.js";
import { DatabaseMcpCredentialResolver } from "./execution/database-mcp-credential-resolver.js";
import { createDefaultMcpAdapterRegistry } from "@faios/mcp";
import { MemoryVectorJobRepository } from "./memory-vector/memory-vector-job.repository.js";
import { MemoryVectorWorker } from "./memory-vector/memory-vector-worker.js";
import { RabbitMqMemoryVectorConsumer } from "./memory-vector/rabbitmq-memory-vector-consumer.js";
import { MemoryVectorPollingLoop } from "./memory-vector/memory-vector-polling-loop.js";

const logger = createLogger("workers");
const database = getPrismaClient();

const executionLoopEnabled = process.env.WORKER_EXECUTION_LOOP_ENABLED === "true";
const rabbitMqConsumerEnabled = process.env.WORKER_RABBITMQ_CONSUMER_ENABLED === "true";
const pollIntervalMs = Number(process.env.WORKER_EXECUTION_POLL_INTERVAL_MS ?? 5000);
const memoryVectorLoopEnabled = process.env.WORKER_MEMORY_VECTOR_LOOP_ENABLED === "true";
const memoryVectorConsumerEnabled =
  process.env.WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED === "true";
const memoryVectorPollIntervalMs = Number(
  process.env.WORKER_MEMORY_VECTOR_POLL_INTERVAL_MS ?? 5000,
);

const worker = new ExecutionWorker(
  new ExecutionRepository(database),
  new RegistryMcpToolExecutor(
    createDefaultMcpAdapterRegistry({
      credentialResolver: new DatabaseMcpCredentialResolver(database),
      includeRealProviderAdapters: process.env.WORKER_REAL_PROVIDER_ADAPTERS_ENABLED === "true",
    }),
  ),
  logger,
);
const memoryVectorWorker = new MemoryVectorWorker(new MemoryVectorJobRepository(database), logger);

if (rabbitMqConsumerEnabled) {
  const rabbitMqUrl = process.env.RABBITMQ_URL;

  if (!rabbitMqUrl) {
    throw new Error("RABBITMQ_URL is required when WORKER_RABBITMQ_CONSUMER_ENABLED=true.");
  }

  await new RabbitMqExecutionConsumer(rabbitMqUrl, worker, logger).start();
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
} else if (executionLoopEnabled) {
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
}

if (memoryVectorConsumerEnabled) {
  const rabbitMqUrl = process.env.RABBITMQ_URL;

  if (!rabbitMqUrl) {
    throw new Error(
      "RABBITMQ_URL is required when WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED=true.",
    );
  }

  await new RabbitMqMemoryVectorConsumer(rabbitMqUrl, memoryVectorWorker, logger).start();
  new MemoryVectorPollingLoop(
    database,
    memoryVectorWorker,
    logger,
    memoryVectorPollIntervalMs,
  ).start();
} else if (memoryVectorLoopEnabled) {
  new MemoryVectorPollingLoop(
    database,
    memoryVectorWorker,
    logger,
    memoryVectorPollIntervalMs,
  ).start();
}

if (
  !rabbitMqConsumerEnabled &&
  !executionLoopEnabled &&
  !memoryVectorConsumerEnabled &&
  !memoryVectorLoopEnabled
) {
  logger.info("Worker service shell started. Worker transports are disabled by default.");
}
