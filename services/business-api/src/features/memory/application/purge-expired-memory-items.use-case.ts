import type { PurgeExpiredMemoryItemsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

export class PurgeExpiredMemoryItemsUseCase {
  private readonly repository: MemoryRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    correlationId: string;
    cutoff?: Date;
  }): Promise<PurgeExpiredMemoryItemsResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const cutoff = input.cutoff ?? new Date();
    const purgedMemoryIds = await this.repository.purgeExpiredDeletedMemoryItems({
      founderId: founder.id,
      cutoff,
    });

    return {
      purgedCount: purgedMemoryIds.length,
      purgedMemoryIds,
      cutoff: cutoff.toISOString(),
      correlationId: input.correlationId,
    };
  }
}
