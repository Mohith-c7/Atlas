import type { ArchiveMemoryItemRequest, ArchiveMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { MemoryVectorSyncService } from "../infrastructure/memory-vector-sync.service.js";

export class ArchiveMemoryItemUseCase {
  private readonly repository: MemoryRepository;
  private readonly vectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
    this.vectorSync = new MemoryVectorSyncService(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    memoryId: string;
    request: ArchiveMemoryItemRequest;
    correlationId: string;
  }): Promise<ArchiveMemoryItemResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const memory = await this.repository.archiveMemoryItem({
      founderId: founder.id,
      memoryId: input.memoryId,
      archived: input.request.archived,
    });
    if (input.request.archived) {
      await this.vectorSync.scheduleDelete(founder.id, [memory.id]);
    } else {
      await this.vectorSync.scheduleUpsert(founder.id, [memory]);
    }

    return {
      memory,
      correlationId: input.correlationId,
    };
  }
}
