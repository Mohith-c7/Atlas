import { randomUUID } from "node:crypto";
import { createTraceContext, readTracingConfig, type TraceContext } from "@faios/observability";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    traceContext: TraceContext;
  }
}

const correlationPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", (request, reply, hookDone) => {
    const tracing = readTracingConfig("business-api");
    const correlationHeader = readFirstHeader(request.headers["x-correlation-id"]);
    const traceIdHeader = readFirstHeader(request.headers["x-trace-id"]);
    const traceparentHeader = readFirstHeader(request.headers.traceparent);

    request.correlationId =
      correlationHeader && correlationHeader.length > 0 ? correlationHeader : randomUUID();
    request.traceContext = createTraceContext({
      correlationId: request.correlationId,
      sampled: tracing.enabled,
      traceId: traceIdHeader,
      traceparent: traceparentHeader,
    });

    reply.header("x-correlation-id", request.correlationId);
    reply.header("x-trace-id", request.traceContext.traceId);
    reply.header("traceparent", request.traceContext.traceparent);
    hookDone();
  });

  done();
};

export const correlationPlugin = fp(correlationPluginCallback, {
  name: "faios-correlation",
});

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
