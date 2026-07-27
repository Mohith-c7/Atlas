import type { MemoryItem } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import {
  createMemoryEmbeddingProvider,
  type MemoryEmbeddingProvider,
} from "./memory-embedding.provider.js";
import {
  QdrantMemoryVectorRepository,
  toQdrantPointId,
} from "./qdrant-memory-vector.repository.js";
import { MemoryRepository } from "./memory.repository.js";

type VectorSyncMode = "async" | "inline" | "disabled";

function readVectorSyncMode(): VectorSyncMode {
  const mode = process.env.MEMORY_VECTOR_SYNC_MODE;

  return mode === "inline" || mode === "disabled" ? mode : "async";
}

export class MemoryVectorSyncService {
  private readonly memoryRepository: MemoryRepository;
  private readonly embeddingProvider: MemoryEmbeddingProvider;
  private readonly vectorRepository: QdrantMemoryVectorRepository;
  private readonly syncMode: VectorSyncMode;

  public constructor(
    private readonly database: PrismaClient,
    input?: {
      embeddingProvider?: MemoryEmbeddingProvider;
      vectorRepository?: QdrantMemoryVectorRepository;
      syncMode?: VectorSyncMode;
    },
  ) {
    this.memoryRepository = new MemoryRepository(database);
    this.embeddingProvider = input?.embeddingProvider ?? createMemoryEmbeddingProvider();
    this.vectorRepository = input?.vectorRepository ?? new QdrantMemoryVectorRepository();
    this.syncMode = input?.syncMode ?? readVectorSyncMode();
  }

  public async scheduleUpsert(founderId: string, memories: readonly MemoryItem[]): Promise<void> {
    if (this.syncMode === "disabled" || memories.length === 0) {
      return;
    }

    const sync = this.upsert(founderId, memories);

    if (this.syncMode === "inline") {
      await sync;
      return;
    }

    sync.catch(() => undefined);
  }

  public async scheduleDelete(founderId: string, memoryIds: readonly string[]): Promise<void> {
    if (this.syncMode === "disabled" || memoryIds.length === 0) {
      return;
    }

    const sync = this.delete(founderId, memoryIds);

    if (this.syncMode === "inline") {
      await sync;
      return;
    }

    sync.catch(() => undefined);
  }

  public async upsert(founderId: string, memories: readonly MemoryItem[]): Promise<void> {
    const activeMemories = memories.filter((memory) => !memory.archivedAt && !memory.deletedAt);

    if (activeMemories.length === 0) {
      return;
    }

    const vectors = await Promise.all(
      activeMemories.map(async (memory) => ({
        id: memory.id,
        founderId,
        vector: await this.embeddingProvider.embedText(`${memory.kind}\n${memory.content}`),
        content: memory.content,
        kind: memory.kind,
      })),
    );

    await this.vectorRepository.upsertMemoryVectors(vectors);

    await Promise.all(
      activeMemories.map((memory) =>
        this.memoryRepository.updateMemoryVectorRef({
          founderId,
          memoryId: memory.id,
          vectorRef: toQdrantPointId(memory.id),
        }),
      ),
    );
  }

  public async delete(founderId: string, memoryIds: readonly string[]): Promise<void> {
    await this.vectorRepository.deleteMemoryVectors(memoryIds);

    await Promise.all(
      memoryIds.map((memoryId) =>
        this.memoryRepository.updateMemoryVectorRef({
          founderId,
          memoryId,
          vectorRef: null,
        }),
      ),
    );
  }
}
