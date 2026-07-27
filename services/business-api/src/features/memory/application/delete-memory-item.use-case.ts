import type { DeleteMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { MemoryVectorSyncService } from "../infrastructure/memory-vector-sync.service.js";

export class DeleteMemoryItemUseCase {
  private readonly repository: MemoryRepository;
  private readonly vectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
    this.vectorSync = new MemoryVectorSyncService(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    memoryId: string;
    correlationId: string;
  }): Promise<DeleteMemoryItemResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const deletion = await this.repository.deleteMemoryItem({
      founderId: founder.id,
      memoryId: input.memoryId,
    });
    await this.vectorSync.scheduleDelete(founder.id, [deletion.deletedMemoryId]);

    return {
      deletedMemoryId: deletion.deletedMemoryId,
      retainUntil: deletion.retainUntil.toISOString(),
      correlationId: input.correlationId,
    };
  }
}
