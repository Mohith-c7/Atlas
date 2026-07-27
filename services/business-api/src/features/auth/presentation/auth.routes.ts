import type { CurrentFounderResponse } from "@faios/contracts";
import type { FastifyPluginCallback } from "fastify";

export const authRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/auth/session/current", async (request, reply) =>
    reply.status(200).send({
      founder: {
        id: request.founderSession.founderId,
        email: request.founderSession.email,
        displayName: request.founderSession.displayName,
      },
      session: {
        id: request.founderSession.sessionId ?? null,
        source: request.founderSession.source,
        expiresAt: request.founderSession.expiresAt?.toISOString() ?? null,
      },
      correlationId: request.correlationId,
    } satisfies CurrentFounderResponse),
  );

  done();
};
