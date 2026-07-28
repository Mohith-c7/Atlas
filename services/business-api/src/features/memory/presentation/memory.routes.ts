import {
  archiveMemoryItemRequestSchema,
  importMemoryItemsRequestSchema,
  mergeMemoryItemsRequestSchema,
  searchMemoryRequestSchema,
  updateMemoryItemRequestSchema,
} from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { recordRequestAuditEventSafely } from "../../../lib/audit-log.js";
import { sendError } from "../../../lib/errors.js";
import { ArchiveMemoryItemUseCase } from "../application/archive-memory-item.use-case.js";
import { DeleteMemoryItemUseCase } from "../application/delete-memory-item.use-case.js";
import { ExportMemoryItemsUseCase } from "../application/export-memory-items.use-case.js";
import { ImportMemoryItemsUseCase } from "../application/import-memory-items.use-case.js";
import { ListMemoryItemsUseCase } from "../application/list-memory-items.use-case.js";
import { MergeMemoryItemsUseCase } from "../application/merge-memory-items.use-case.js";
import { PurgeExpiredMemoryItemsUseCase } from "../application/purge-expired-memory-items.use-case.js";
import { SearchMemoryItemsUseCase } from "../application/search-memory-items.use-case.js";
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

  server.post("/api/v1/memory/import", async (request, reply) => {
    const parsedBody = importMemoryItemsRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid memory import request.",
        correlationId: request.correlationId,
        details: parsedBody.error.flatten(),
      });
    }

    const database = getPrismaClient();
    const useCase = new ImportMemoryItemsUseCase(database);

    try {
      const response = await useCase.execute({
        founderSession: request.founderSession,
        request: parsedBody.data,
        correlationId: request.correlationId,
      });

      request.log.info(
        {
          importedCount: response.importedCount,
          replacedExistingCount: response.replacedExistingCount,
          correlationId: response.correlationId,
        },
        "Memory items imported",
      );
      recordRequestAuditEventSafely(database, request, {
        action: "memory.import",
        resourceType: "memory_item",
        metadata: {
          importedCount: response.importedCount,
          replacedExistingCount: response.replacedExistingCount,
        },
      });

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to import memory items",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/memory/search", async (request, reply) => {
    const parsedBody = searchMemoryRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid memory search request.",
        correlationId: request.correlationId,
        details: parsedBody.error.flatten(),
      });
    }

    const useCase = new SearchMemoryItemsUseCase(getPrismaClient());

    try {
      return reply.status(200).send(
        await useCase.execute({
          founderSession: request.founderSession,
          request: parsedBody.data,
          correlationId: request.correlationId,
        }),
      );
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to search memory items",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/memory/merge", async (request, reply) => {
    const parsedBody = mergeMemoryItemsRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid memory merge request.",
        correlationId: request.correlationId,
        details: parsedBody.error.flatten(),
      });
    }

    const database = getPrismaClient();
    const useCase = new MergeMemoryItemsUseCase(database);

    try {
      const response = await useCase.execute({
        founderSession: request.founderSession,
        request: parsedBody.data,
        correlationId: request.correlationId,
      });

      request.log.info(
        {
          memoryId: response.memory.id,
          mergedMemoryIds: response.mergedMemoryIds,
          correlationId: response.correlationId,
        },
        "Memory items merged",
      );
      recordRequestAuditEventSafely(database, request, {
        action: "memory.merge",
        resourceType: "memory_item",
        resourceId: response.memory.id,
        metadata: {
          mergedMemoryIds: response.mergedMemoryIds,
        },
      });

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to merge memory items",
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

      const database = getPrismaClient();
      const useCase = new UpdateMemoryItemUseCase(database);

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
        recordRequestAuditEventSafely(database, request, {
          action: "memory.update",
          resourceType: "memory_item",
          resourceId: response.memory.id,
          metadata: {
            updatedFields: Object.keys(parsedBody.data),
          },
        });

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
      const database = getPrismaClient();
      const useCase = new DeleteMemoryItemUseCase(database);

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
        recordRequestAuditEventSafely(database, request, {
          action: "memory.delete",
          resourceType: "memory_item",
          resourceId: response.deletedMemoryId,
        });

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

  server.post<{ Params: MemoryItemParams }>(
    "/api/v1/memory/items/:memoryId/archive",
    { schema: { params: memoryItemParamsSchema } },
    async (request, reply) => {
      const parsedBody = archiveMemoryItemRequestSchema.safeParse(request.body ?? undefined);

      if (!parsedBody.success) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Invalid memory archive request.",
          correlationId: request.correlationId,
          details: parsedBody.error.flatten(),
        });
      }

      const database = getPrismaClient();
      const useCase = new ArchiveMemoryItemUseCase(database);

      try {
        const response = await useCase.execute({
          founderSession: request.founderSession,
          memoryId: request.params.memoryId,
          request: parsedBody.data,
          correlationId: request.correlationId,
        });

        request.log.info(
          {
            memoryId: response.memory.id,
            archived: Boolean(response.memory.archivedAt),
            correlationId: response.correlationId,
          },
          "Memory item archive state changed",
        );
        recordRequestAuditEventSafely(database, request, {
          action: "memory.archive",
          resourceType: "memory_item",
          resourceId: response.memory.id,
          metadata: {
            archived: Boolean(response.memory.archivedAt),
          },
        });

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            correlationId: request.correlationId,
            error,
          },
          "Failed to archive memory item",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.post("/api/v1/memory/retention/purge", async (request, reply) => {
    const database = getPrismaClient();
    const useCase = new PurgeExpiredMemoryItemsUseCase(database);

    try {
      const response = await useCase.execute({
        founderSession: request.founderSession,
        correlationId: request.correlationId,
      });

      request.log.info(
        {
          purgedCount: response.purgedCount,
          correlationId: response.correlationId,
        },
        "Expired memory items purged",
      );
      recordRequestAuditEventSafely(database, request, {
        action: "memory.retention.purge",
        actorType: "system",
        resourceType: "memory_item",
        metadata: {
          purgedCount: response.purgedCount,
        },
      });

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to purge expired memory items",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
