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
import { MemoryVectorSyncService } from "../infrastructure/memory-vector-sync.service.js";
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
  private readonly vectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.vectorSync = new MemoryVectorSyncService(database);
  }

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
      const replacedExistingMemoryIds =
        input.request.mode === "replace"
          ? await repository.deleteFounderMemoryItems(founder.id)
          : [];
      const memories = await repository.createImportedMemoryItems({
        founderId: founder.id,
        memories: normalizedMemories,
      });

      return {
        memories,
        replacedExistingMemoryIds,
      };
    });
    await this.vectorSync.scheduleDelete(founder.id, result.replacedExistingMemoryIds);
    await this.vectorSync.scheduleUpsert(founder.id, result.memories);

    return {
      memories: result.memories,
      importedCount: result.memories.length,
      replacedExistingCount: result.replacedExistingMemoryIds.length,
      importedAt,
      correlationId: input.correlationId,
    };
  }
}
