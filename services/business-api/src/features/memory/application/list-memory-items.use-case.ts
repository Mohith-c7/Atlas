import type { ListMemoryItemsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

const MEMORY_LIST_LIMIT = 100;

export class ListMemoryItemsUseCase {
  private readonly repository: MemoryRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
  }

  public async execute(
    founderSession: FounderSession | undefined,
    correlationId: string,
  ): Promise<ListMemoryItemsResponse> {
    const founder = await resolveFounderAccount(this.database, founderSession);
    const memories = await this.repository.listMemoryItems(founder.id, MEMORY_LIST_LIMIT);

    return {
      memories,
      correlationId,
    };
  }
}
