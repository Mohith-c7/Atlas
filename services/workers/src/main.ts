import { createLogger } from "@faios/logger";
import { getPrismaClient } from "@faios/database";
import { serverEnvSchema } from "@faios/env";
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
import { assertMemoryVectorRuntimeReady } from "./memory-vector/memory-vector-runtime-readiness.js";
import { MemoryVectorJobMetrics } from "./memory-vector/memory-vector-job.metrics.js";
import { startWorkerMetricsServer } from "./observability/worker-metrics-server.js";

const logger = createLogger("workers");
const env = serverEnvSchema.parse(process.env);
const database = getPrismaClient();

const executionLoopEnabled = env.WORKER_EXECUTION_LOOP_ENABLED;
const rabbitMqConsumerEnabled = env.WORKER_RABBITMQ_CONSUMER_ENABLED;
const pollIntervalMs = env.WORKER_EXECUTION_POLL_INTERVAL_MS;
const memoryVectorLoopEnabled = env.WORKER_MEMORY_VECTOR_LOOP_ENABLED;
const memoryVectorConsumerEnabled = env.WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED;
const memoryVectorPollIntervalMs = env.WORKER_MEMORY_VECTOR_POLL_INTERVAL_MS;
const memoryVectorRuntimeEnabled = memoryVectorConsumerEnabled || memoryVectorLoopEnabled;
const workerMetricsPort = env.WORKER_METRICS_PORT ?? null;

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
const memoryVectorMetrics = new MemoryVectorJobMetrics();
const memoryVectorWorker = new MemoryVectorWorker(
  new MemoryVectorJobRepository(database),
  logger,
  undefined,
  undefined,
  memoryVectorMetrics,
);

if (workerMetricsPort !== null) {
  if (!Number.isInteger(workerMetricsPort) || workerMetricsPort <= 0) {
    throw new Error("WORKER_METRICS_PORT must be a positive integer when set.");
  }

  await startWorkerMetricsServer({
    port: workerMetricsPort,
    logger,
    memoryVectorMetrics,
  });
}

if (rabbitMqConsumerEnabled) {
  await new RabbitMqExecutionConsumer(env.RABBITMQ_URL, worker, logger, {
    concurrency: env.WORKER_EXECUTION_CONCURRENCY,
  }).start();
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
} else if (executionLoopEnabled) {
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
}

await assertMemoryVectorRuntimeReady({
  database,
  logger,
  memoryVectorRuntimeEnabled,
  rabbitMqConsumerEnabled: memoryVectorConsumerEnabled,
  rabbitMqUrl: env.RABBITMQ_URL,
});

if (memoryVectorConsumerEnabled) {
  await new RabbitMqMemoryVectorConsumer(
    env.RABBITMQ_URL,
    memoryVectorWorker,
    logger,
    memoryVectorMetrics,
    {
      concurrency: env.MEMORY_VECTOR_WORKER_CONCURRENCY,
      deadLetterQueueName: env.MEMORY_VECTOR_DEAD_LETTER_QUEUE_NAME,
      queueName: env.MEMORY_VECTOR_QUEUE_NAME,
    },
  ).start();
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
