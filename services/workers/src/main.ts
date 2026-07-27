import { createLogger } from "@faios/logger";
import { getPrismaClient } from "@faios/database";
import { ExecutionRepository } from "./execution/execution.repository.js";
import { ExecutionWorker } from "./execution/execution-worker.js";
import { NoopMcpToolExecutor } from "./execution/noop-mcp-tool-executor.js";
import { RabbitMqExecutionConsumer } from "./execution/rabbitmq-execution-consumer.js";

const logger = createLogger("workers");

const executionLoopEnabled = process.env.WORKER_EXECUTION_LOOP_ENABLED === "true";
const rabbitMqConsumerEnabled = process.env.WORKER_RABBITMQ_CONSUMER_ENABLED === "true";

const worker = new ExecutionWorker(
  new ExecutionRepository(getPrismaClient()),
  new NoopMcpToolExecutor(),
  logger,
);

if (rabbitMqConsumerEnabled) {
  const rabbitMqUrl = process.env.RABBITMQ_URL;

  if (!rabbitMqUrl) {
    throw new Error("RABBITMQ_URL is required when WORKER_RABBITMQ_CONSUMER_ENABLED=true.");
  }

  await new RabbitMqExecutionConsumer(rabbitMqUrl, worker, logger).start();
} else if (executionLoopEnabled) {
  const result = await worker.runOnce();

  logger.info({ result }, "Execution worker run completed");
} else {
  logger.info("Worker service shell started. Execution transports are disabled by default.");
}
