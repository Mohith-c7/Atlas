import { createLogger } from "@faios/logger";
import { getPrismaClient } from "@faios/database";
import { ExecutionRepository } from "./execution/execution.repository.js";
import { ExecutionWorker } from "./execution/execution-worker.js";
import { NoopMcpToolExecutor } from "./execution/noop-mcp-tool-executor.js";

const logger = createLogger("workers");

const executionLoopEnabled = process.env.WORKER_EXECUTION_LOOP_ENABLED === "true";

if (!executionLoopEnabled) {
  logger.info("Worker service shell started. Execution loop is disabled by default.");
} else {
  const worker = new ExecutionWorker(
    new ExecutionRepository(getPrismaClient()),
    new NoopMcpToolExecutor(),
    logger,
  );

  const result = await worker.runOnce();

  logger.info({ result }, "Execution worker run completed");
}
