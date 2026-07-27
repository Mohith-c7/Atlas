import type { UpdateMemoryItemRequest, UpdateMemoryItemResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { redactSensitiveText } from "@faios/security";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

function redactMemoryContent(value: string): string {
  return redactSensitiveText(value).replace(
    /\b(token|secret|api key|api-key)\s+(?:is\s+|as\s+|called\s+|named\s+|using\s+)?\S+/giu,
    "$1 [REDACTED]",
  );
}

export class UpdateMemoryItemUseCase {
  private readonly repository: MemoryRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new MemoryRepository(database);
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

    return {
      memory,
      correlationId: input.correlationId,
    };
  }
}
