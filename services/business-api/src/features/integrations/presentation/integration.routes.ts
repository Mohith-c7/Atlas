import { githubIntegrationConnectionRequestSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { ConnectGitHubIntegrationUseCase } from "../application/connect-github-integration.use-case.js";
import { ListIntegrationConnectionsUseCase } from "../application/list-integration-connections.use-case.js";

export const integrationRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/integrations/connections", async (request, reply) => {
    const useCase = new ListIntegrationConnectionsUseCase(getPrismaClient());

    try {
      return reply
        .status(200)
        .send(await useCase.execute(request.correlationId, request.founderSession));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list integration connections",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/integrations/github/connections", async (request, reply) => {
    const parsed = githubIntegrationConnectionRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid GitHub integration connection request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new ConnectGitHubIntegrationUseCase(getPrismaClient());

    try {
      const response = await useCase.execute(
        parsed.data,
        request.correlationId,
        request.founderSession,
      );

      request.log.info(
        {
          connectionId: response.connection.id,
          provider: response.connection.provider,
          correlationId: response.correlationId,
        },
        "Integration connection stored",
      );

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to connect GitHub integration",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
