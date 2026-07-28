import {
  collectNodeProcessMetrics,
  MetricsRegistry,
  renderPrometheusText,
} from "@faios/observability";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    metricsStartedAt?: number;
  }
}

const registry = new MetricsRegistry({ service: "business-api" });

function routeLabel(url: string, routePath?: string): string {
  if (routePath && routePath.length > 0) {
    return routePath;
  }

  return url.split("?", 1)[0] ?? "/";
}

const httpMetricsPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", (request, _reply, doneHook) => {
    request.metricsStartedAt = performance.now();
    doneHook();
  });

  server.addHook("onResponse", async (request, reply) => {
    const latencyMs =
      typeof request.metricsStartedAt === "number"
        ? Math.max(0, performance.now() - request.metricsStartedAt)
        : 0;
    const labels = {
      method: request.method,
      route: routeLabel(request.url, request.routeOptions.url),
      status_code: reply.statusCode,
    };

    registry.incrementCounter("faios_http_requests_total", "Total HTTP requests.", labels);
    registry.incrementCounter(
      "faios_http_request_duration_ms_total",
      "Total HTTP request duration in milliseconds.",
      labels,
      Math.round(latencyMs),
    );
    registry.incrementCounter(
      "faios_http_request_duration_samples_total",
      "Total HTTP request duration sample count.",
      labels,
    );
  });

  server.get("/metrics", async (_request, reply) => {
    collectNodeProcessMetrics(registry);

    return reply
      .type("text/plain; version=0.0.4; charset=utf-8")
      .status(200)
      .send(renderPrometheusText(registry.snapshot()));
  });

  done();
};

export const httpMetricsPlugin = fp(httpMetricsPluginCallback, {
  name: "faios-http-metrics",
});
