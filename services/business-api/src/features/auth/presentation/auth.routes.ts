import type { CurrentFounderResponse } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import {
  ListFounderSessionsUseCase,
  RevokeFounderSessionUseCase,
} from "../application/manage-founder-sessions.use-case.js";

const sessionIdParamsSchema = {
  type: "object",
  required: ["sessionId"],
  properties: {
    sessionId: { type: "string", minLength: 1 },
  },
} as const;

type SessionIdParams = {
  sessionId: string;
};

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

  server.get("/api/v1/auth/sessions", async (request, reply) => {
    const useCase = new ListFounderSessionsUseCase(getPrismaClient());

    try {
      return reply
        .status(200)
        .send(await useCase.execute(request.founderSession, request.correlationId));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list founder sessions",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.delete<{ Params: SessionIdParams }>(
    "/api/v1/auth/sessions/:sessionId",
    { schema: { params: sessionIdParamsSchema } },
    async (request, reply) => {
      const useCase = new RevokeFounderSessionUseCase(getPrismaClient());

      try {
        const response = await useCase.execute({
          founderSession: request.founderSession,
          sessionId: request.params.sessionId,
          correlationId: request.correlationId,
        });

        request.log.info(
          {
            sessionId: response.session.id,
            founderId: request.founderSession.founderId,
            correlationId: response.correlationId,
          },
          "Founder session revoked",
        );

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            correlationId: request.correlationId,
            error,
          },
          "Failed to revoke founder session",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  done();
};
