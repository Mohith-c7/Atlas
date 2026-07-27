import type { MergeMemoryItemsRequest, MergeMemoryItemsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { redactSensitiveText } from "@faios/security";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { MemoryVectorSyncService } from "../infrastructure/memory-vector-sync.service.js";

function redactMergedContent(value: string): string {
  return redactSensitiveText(value).trim();
}

export class MergeMemoryItemsUseCase {
  private readonly repository: MemoryRepository;
  private readonly vectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
    this.vectorSync = new MemoryVectorSyncService(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    request: MergeMemoryItemsRequest;
    correlationId: string;
  }): Promise<MergeMemoryItemsResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const content = input.request.content ? redactMergedContent(input.request.content) : undefined;

    if (input.request.content !== undefined && !content) {
      throw new AppError("MEMORY_CONTENT_EMPTY", "Merged memory content cannot be empty.", 400);
    }

    const result = await this.repository.mergeMemoryItems({
      founderId: founder.id,
      request: {
        ...input.request,
        content,
      },
    });
    await this.vectorSync.scheduleDelete(founder.id, result.mergedMemoryIds);
    await this.vectorSync.scheduleUpsert(founder.id, [result.memory]);

    return {
      ...result,
      correlationId: input.correlationId,
    };
  }
}
