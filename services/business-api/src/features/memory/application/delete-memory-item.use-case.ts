import type { DeleteMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

export class DeleteMemoryItemUseCase {
  private readonly repository: MemoryRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    memoryId: string;
    correlationId: string;
  }): Promise<DeleteMemoryItemResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const deletedMemoryId = await this.repository.deleteMemoryItem({
      founderId: founder.id,
      memoryId: input.memoryId,
    });

    return {
      deletedMemoryId,
      correlationId: input.correlationId,
    };
  }
}
