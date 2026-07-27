import type { ArchiveMemoryItemRequest, ArchiveMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

export class ArchiveMemoryItemUseCase {
  private readonly repository: MemoryRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
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

    return {
      memory,
      correlationId: input.correlationId,
    };
  }
}
