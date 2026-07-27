import { updateMemoryItemRequestSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { DeleteMemoryItemUseCase } from "../application/delete-memory-item.use-case.js";
import { ExportMemoryItemsUseCase } from "../application/export-memory-items.use-case.js";
import { ListMemoryItemsUseCase } from "../application/list-memory-items.use-case.js";
import { UpdateMemoryItemUseCase } from "../application/update-memory-item.use-case.js";

type MemoryItemParams = {
  memoryId: string;
};

const memoryItemParamsSchema = {
  type: "object",
  required: ["memoryId"],
  properties: {
    memoryId: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

export const memoryRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/memory/items", async (request, reply) => {
    const useCase = new ListMemoryItemsUseCase(getPrismaClient());

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
        "Failed to list memory items",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.get("/api/v1/memory/export", async (request, reply) => {
    const useCase = new ExportMemoryItemsUseCase(getPrismaClient());

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
        "Failed to export memory items",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.patch<{ Params: MemoryItemParams }>(
    "/api/v1/memory/items/:memoryId",
    { schema: { params: memoryItemParamsSchema } },
    async (request, reply) => {
      const parsedBody = updateMemoryItemRequestSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Invalid memory update request.",
          correlationId: request.correlationId,
          details: parsedBody.error.flatten(),
        });
      }

      const useCase = new UpdateMemoryItemUseCase(getPrismaClient());

      try {
        const response = await useCase.execute({
          founderSession: request.founderSession,
          memoryId: request.params.memoryId,
          patch: parsedBody.data,
          correlationId: request.correlationId,
        });

        request.log.info(
          {
            memoryId: response.memory.id,
            correlationId: response.correlationId,
          },
          "Memory item updated",
        );

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            correlationId: request.correlationId,
            error,
          },
          "Failed to update memory item",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.delete<{ Params: MemoryItemParams }>(
    "/api/v1/memory/items/:memoryId",
    { schema: { params: memoryItemParamsSchema } },
    async (request, reply) => {
      const useCase = new DeleteMemoryItemUseCase(getPrismaClient());

      try {
        const response = await useCase.execute({
          founderSession: request.founderSession,
          memoryId: request.params.memoryId,
          correlationId: request.correlationId,
        });

        request.log.info(
          {
            memoryId: response.deletedMemoryId,
            correlationId: response.correlationId,
          },
          "Memory item deleted",
        );

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            correlationId: request.correlationId,
            error,
          },
          "Failed to delete memory item",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  done();
};
