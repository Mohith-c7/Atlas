import { updateFounderAccountRequestSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { GetFounderAccountUseCase } from "../application/get-founder-account.use-case.js";
import { UpdateFounderAccountUseCase } from "../application/update-founder-account.use-case.js";

export const accountRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/account", async (request, reply) => {
    const useCase = new GetFounderAccountUseCase(getPrismaClient());

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
        "Failed to get founder account",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.patch("/api/v1/account", async (request, reply) => {
    const parsed = updateFounderAccountRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid founder account update request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new UpdateFounderAccountUseCase(getPrismaClient());

    try {
      const response = await useCase.execute(
        request.founderSession,
        parsed.data,
        request.correlationId,
      );

      request.log.info(
        {
          founderId: response.account.id,
          correlationId: response.correlationId,
        },
        "Founder account updated",
      );

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to update founder account",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
