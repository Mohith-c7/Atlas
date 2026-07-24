import { randomUUID } from "node:crypto";
import type { FastifyPluginCallback } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export const correlationPlugin: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", async (request, reply) => {
    const header = request.headers["x-correlation-id"];
    const correlationId = Array.isArray(header) ? header[0] : header;

    request.correlationId =
      correlationId && correlationId.length > 0 ? correlationId : randomUUID();
    reply.header("x-correlation-id", request.correlationId);
  });

  done();
};
