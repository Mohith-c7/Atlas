import type { SearchMemoryRequest, SearchMemoryResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { QdrantMemoryVectorRepository } from "../infrastructure/qdrant-memory-vector.repository.js";
import { MemoryRepository } from "../infrastructure/memory.repository.js";
import { createDeterministicTextVector } from "./memory-text-vector.js";

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
    const lexicalMatches = await this.memoryRepository.searchMemoryItems({
      founderId: founder.id,
      query: input.request.query,
      limit,
    });

    try {
      const vectorMatches = await this.vectorRepository.searchSimilarMemory({
        founderId: founder.id,
        vector: createDeterministicTextVector(input.request.query),
        limit,
      });
      const vectorIds = new Set(vectorMatches.map((match) => match.id));

      return {
        matches: lexicalMatches.map((match) => ({
          ...match,
          score: vectorIds.has(match.memory.id) ? Math.max(match.score, 0.9) : match.score,
          matchReason: vectorIds.has(match.memory.id)
            ? "Founder-scoped semantic memory match"
            : match.matchReason,
        })),
        searchedAt: new Date().toISOString(),
        correlationId: input.correlationId,
      };
    } catch {
      return {
        matches: lexicalMatches,
        searchedAt: new Date().toISOString(),
        correlationId: input.correlationId,
      };
    }
  }
}
