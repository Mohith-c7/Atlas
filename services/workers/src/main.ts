import { createLogger } from "@faios/logger";

const logger = createLogger("workers");

logger.info("Worker service shell started. Consumers are intentionally deferred.");
