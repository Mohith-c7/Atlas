import { randomUUID } from "node:crypto";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

const correlationPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", async (request, reply) => {
    const header = request.headers["x-correlation-id"];
    const correlationId = Array.isArray(header) ? header[0] : header;

    request.correlationId =
      correlationId && correlationId.length > 0 ? correlationId : randomUUID();
    reply.header("x-correlation-id", request.correlationId);
  });

  done();
};

export const correlationPlugin = fp(correlationPluginCallback, {
  name: "faios-correlation",
});
