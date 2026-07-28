import { createServer, type Server } from "node:http";
import {
  collectNodeProcessMetrics,
  MetricsRegistry,
  renderPrometheusText,
} from "@faios/observability";
import {
  collectMemoryVectorJobMetrics,
  type MemoryVectorJobMetrics,
} from "../memory-vector/memory-vector-job.metrics.js";

type MetricsLogger = {
  info(bindings: Record<string, unknown>, message: string): void;
};

export type WorkerMetricsServerOptions = {
  readonly port: number;
  readonly logger: MetricsLogger;
  readonly memoryVectorMetrics: MemoryVectorJobMetrics;
};

export async function startWorkerMetricsServer({
  port,
  logger,
  memoryVectorMetrics,
}: WorkerMetricsServerOptions): Promise<Server> {
  const registry = new MetricsRegistry({ service: "workers" });
  const server = createServer((request, response) => {
    if (request.url !== "/metrics") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found\n");
      return;
    }

    collectNodeProcessMetrics(registry);
    collectMemoryVectorJobMetrics(registry, memoryVectorMetrics);

    response.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
    });
    response.end(renderPrometheusText(registry.snapshot()));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info({ port }, "Worker metrics server started.");
  return server;
}
