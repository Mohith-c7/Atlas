import { createLogger } from "@faios/logger";
import { getPrismaClient } from "@faios/database";
import { ExecutionRepository } from "./execution/execution.repository.js";
import { ExecutionWorker } from "./execution/execution-worker.js";
import { ExecutionPollingLoop } from "./execution/execution-polling-loop.js";
import { RabbitMqExecutionConsumer } from "./execution/rabbitmq-execution-consumer.js";
import { RegistryMcpToolExecutor } from "./execution/registry-mcp-tool-executor.js";
import { DatabaseMcpCredentialResolver } from "./execution/database-mcp-credential-resolver.js";
import { createDefaultMcpAdapterRegistry } from "@faios/mcp";

const logger = createLogger("workers");

const executionLoopEnabled = process.env.WORKER_EXECUTION_LOOP_ENABLED === "true";
const rabbitMqConsumerEnabled = process.env.WORKER_RABBITMQ_CONSUMER_ENABLED === "true";
const pollIntervalMs = Number(process.env.WORKER_EXECUTION_POLL_INTERVAL_MS ?? 5000);

const worker = new ExecutionWorker(
  new ExecutionRepository(getPrismaClient()),
  new RegistryMcpToolExecutor(
    createDefaultMcpAdapterRegistry({
      credentialResolver: new DatabaseMcpCredentialResolver(getPrismaClient()),
      includeRealProviderAdapters: process.env.WORKER_REAL_PROVIDER_ADAPTERS_ENABLED === "true",
    }),
  ),
  logger,
);

if (rabbitMqConsumerEnabled) {
  const rabbitMqUrl = process.env.RABBITMQ_URL;

  if (!rabbitMqUrl) {
    throw new Error("RABBITMQ_URL is required when WORKER_RABBITMQ_CONSUMER_ENABLED=true.");
  }

  await new RabbitMqExecutionConsumer(rabbitMqUrl, worker, logger).start();
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
} else if (executionLoopEnabled) {
  new ExecutionPollingLoop(worker, logger, pollIntervalMs).start();
} else {
  logger.info("Worker service shell started. Execution transports are disabled by default.");
}
