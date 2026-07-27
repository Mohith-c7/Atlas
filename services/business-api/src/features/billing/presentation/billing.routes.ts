import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { GetBillingStatusUseCase } from "../application/get-billing-status.use-case.js";

export const billingRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/billing/status", async (request, reply) => {
    const useCase = new GetBillingStatusUseCase(getPrismaClient());

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
        "Failed to get billing status",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
