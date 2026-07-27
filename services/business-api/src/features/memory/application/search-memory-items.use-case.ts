import type { SearchMemoryRequest, SearchMemoryResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { createMemoryEmbeddingProvider } from "../infrastructure/memory-embedding.provider.js";
import { QdrantMemoryVectorRepository } from "../infrastructure/qdrant-memory-vector.repository.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";

const DEFAULT_SEARCH_LIMIT = 10;

export class SearchMemoryItemsUseCase {
  private readonly memoryRepository: MemoryRepository;
  private readonly vectorRepository: QdrantMemoryVectorRepository;

  public constructor(private readonly database: PrismaClient) {
    this.memoryRepository = new MemoryRepository(database);
    this.vectorRepository = new QdrantMemoryVectorRepository();
  }

  public async execute(input: {
    founderSession: FounderSession | undefined;
    request: SearchMemoryRequest;
    correlationId: string;
  }): Promise<SearchMemoryResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const limit = input.request.limit ?? DEFAULT_SEARCH_LIMIT;

    try {
      const embeddingProvider = createMemoryEmbeddingProvider();
      const vectorMatches = await this.vectorRepository.searchSimilarMemory({
        founderId: founder.id,
        vector: await embeddingProvider.embedText(input.request.query),
        limit,
      });
      const scoreByMemoryId = new Map(
        vectorMatches.map((match) => [match.memoryId, match.score] as const),
      );
      const memories = await this.memoryRepository.listMemoryItemsByIds({
        founderId: founder.id,
        memoryIds: vectorMatches.map((match) => match.memoryId),
      });

      if (memories.length > 0) {
        return {
          matches: memories.map((memory) => ({
            memory,
            score: scoreByMemoryId.get(memory.id) ?? 0,
            matchReason: "Founder-scoped semantic memory match",
          })),
          searchedAt: new Date().toISOString(),
          correlationId: input.correlationId,
        };
      }
    } catch {
      // Fall through to lexical search when vector infrastructure is unavailable.
    }

    const lexicalMatches = await this.memoryRepository.searchMemoryItems({
      founderId: founder.id,
      query: input.request.query,
      limit,
    });

    return {
      matches: lexicalMatches,
      searchedAt: new Date().toISOString(),
      correlationId: input.correlationId,
    };
  }
}
