import { redactHttpHeaders, redactSensitiveValue } from "@faios/security";
import { traceLogFields } from "@faios/observability";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

const requestStartTimes = new WeakMap<object, bigint>();

const accessLogPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", (request, _reply, doneHook) => {
    requestStartTimes.set(request, process.hrtime.bigint());
    doneHook();
  });

  server.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartTimes.get(request);
    const durationMs = startedAt
      ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
      : undefined;

    request.log.info(
      {
        correlationId: request.correlationId,
        durationMs: durationMs ? Math.round(durationMs) : undefined,
        founderId: request.founderSession?.founderId,
        headers: redactHttpHeaders(request.headers),
        method: request.method,
        remoteAddress: request.ip,
        statusCode: reply.statusCode,
        ...traceLogFields(request.traceContext),
        url: request.url,
      },
      "Business API request completed",
    );
  });

  server.addHook("onError", async (request, _reply, error) => {
    request.log.error(
      {
        correlationId: request.correlationId,
        error: redactSensitiveValue({
          message: error.message,
          name: error.name,
          stack: error.stack,
        }),
        founderId: request.founderSession?.founderId,
        method: request.method,
        ...traceLogFields(request.traceContext),
        url: request.url,
      },
      "Business API request failed",
    );
  });

  done();
};

export const accessLogPlugin = fp(accessLogPluginCallback, {
  name: "faios-access-log",
});
