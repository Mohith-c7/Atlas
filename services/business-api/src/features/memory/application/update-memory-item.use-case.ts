import type { UpdateMemoryItemRequest, UpdateMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { MemoryVectorSyncService } from "../infrastructure/memory-vector-sync.service.js";
import { redactMemoryContent } from "./redact-memory-content.js";

export class UpdateMemoryItemUseCase {
  private readonly repository: MemoryRepository;
  private readonly vectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
    this.vectorSync = new MemoryVectorSyncService(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    memoryId: string;
    patch: UpdateMemoryItemRequest;
    correlationId: string;
  }): Promise<UpdateMemoryItemResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const content = input.patch.content
      ? redactMemoryContent(input.patch.content).trim()
      : undefined;

    if (input.patch.content !== undefined && !content) {
      throw new AppError("MEMORY_CONTENT_EMPTY", "Memory content cannot be empty.", 400);
    }

    const memory = await this.repository.updateMemoryItem({
      founderId: founder.id,
      memoryId: input.memoryId,
      patch: {
        ...input.patch,
        content,
      },
    });
    await this.vectorSync.scheduleUpsert(founder.id, [memory]);

    return {
      memory,
      correlationId: input.correlationId,
    };
  }
}
