import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { ListFounderWorkflowsUseCase } from "../application/list-founder-workflows.use-case.js";

export const workflowRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/workflows", async (request, reply) => {
    const useCase = new ListFounderWorkflowsUseCase(getPrismaClient());

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
        "Failed to list founder workflows",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
