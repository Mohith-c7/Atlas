import { createCommandRequestSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { CreateCommandUseCase } from "../application/create-command.use-case.js";
import { ListCommandExecutionsUseCase } from "../application/list-command-executions.use-case.js";

export const commandRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/commands/executions", async (request, reply) => {
    const useCase = new ListCommandExecutionsUseCase(getPrismaClient());

    try {
      return reply.status(200).send(await useCase.execute(request.founderSession));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list command executions",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/commands", async (request, reply) => {
    const parsed = createCommandRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid command request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new CreateCommandUseCase(getPrismaClient());

    try {
      const response = await useCase.execute({
        request: parsed.data,
        correlationId: request.correlationId,
        founderSession: request.founderSession,
      });

      request.log.info(
        {
          commandId: response.commandId,
          conversationId: response.conversationId,
          correlationId: response.correlationId,
          status: response.status,
        },
        "Founder command planned",
      );

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Founder command failed",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
