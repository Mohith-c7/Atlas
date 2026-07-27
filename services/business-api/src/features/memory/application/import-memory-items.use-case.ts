import type {
  ImportMemoryItem,
  ImportMemoryItemsRequest,
  ImportMemoryItemsResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { redactMemoryContent } from "./redact-memory-content.js";

type NormalizedImportedMemory = {
  readonly kind: ImportMemoryItem["kind"];
  readonly content: string;
  readonly source: string | null;
  readonly confidence: number | null;
};

function normalizeImportedMemory(memory: ImportMemoryItem): NormalizedImportedMemory {
  const content = redactMemoryContent(memory.content).trim();

  if (!content) {
    throw new AppError("MEMORY_CONTENT_EMPTY", "Imported memory content cannot be empty.", 400);
  }

  return {
    kind: memory.kind,
    content,
    source: memory.source?.trim() || "founder_import",
    confidence: memory.confidence ?? null,
  };
}

export class ImportMemoryItemsUseCase {
  public constructor(private readonly database: PrismaClient) {}

  public async execute(input: {
    founderSession: FounderSession | undefined;
    request: ImportMemoryItemsRequest;
    correlationId: string;
  }): Promise<ImportMemoryItemsResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const importedAt = new Date().toISOString();
    const normalizedMemories = input.request.memories.map(normalizeImportedMemory);

    const result = await this.database.$transaction(async (transaction) => {
      const repository = new MemoryRepository(transaction);
      const replacedExistingCount =
        input.request.mode === "replace"
          ? await repository.deleteFounderMemoryItems(founder.id)
          : 0;
      const memories = await repository.createImportedMemoryItems({
        founderId: founder.id,
        memories: normalizedMemories,
      });

      return {
        memories,
        replacedExistingCount,
      };
    });

    return {
      memories: result.memories,
      importedCount: result.memories.length,
      replacedExistingCount: result.replacedExistingCount,
      importedAt,
      correlationId: input.correlationId,
    };
  }
}
