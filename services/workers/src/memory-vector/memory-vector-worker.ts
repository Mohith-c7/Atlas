import {
  createMemoryEmbeddingProvider,
  QdrantMemoryVectorRepository,
  toQdrantPointId,
} from "@faios/memory-vector";
import type { MemoryEmbeddingProvider } from "@faios/memory-vector";
import type { MemoryVectorJobRepository } from "./memory-vector-job.repository.js";

type WorkerLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

export class MemoryVectorWorker {
  public constructor(
    private readonly repository: MemoryVectorJobRepository,
    private readonly logger: WorkerLogger,
    private readonly embeddingProvider: MemoryEmbeddingProvider = createMemoryEmbeddingProvider(),
    private readonly vectorRepository = new QdrantMemoryVectorRepository(),
  ) {}

  public async runJob(jobId: string): Promise<{ processed: boolean; status?: string }> {
    const job = await this.repository.claimJob(jobId);

    if (!job) {
      return { processed: false };
    }

    try {
      if (job.action === "upsert") {
        const memories = await this.repository.listActiveMemories({
          founderId: job.founderId,
          memoryIds: job.memoryIds,
        });
        const vectors = await Promise.all(
          memories.map(async (memory) => ({
            id: memory.id,
            founderId: job.founderId,
            kind: memory.kind.toLowerCase(),
            content: memory.content,
            vector: await this.embeddingProvider.embedText(
              `${memory.kind.toLowerCase()}\n${memory.content}`,
            ),
          })),
        );

        await this.vectorRepository.upsertMemoryVectors(vectors);

        await Promise.all(
          memories.map((memory) =>
            this.repository.updateVectorRefs({
              founderId: job.founderId,
              memoryIds: [memory.id],
              vectorRef: toQdrantPointId(memory.id),
            }),
          ),
        );
      } else {
        await this.vectorRepository.deleteMemoryVectors(job.memoryIds);
        await this.repository.updateVectorRefs({
          founderId: job.founderId,
          memoryIds: job.memoryIds,
          vectorRef: null,
        });
      }

      await this.repository.completeJob(job.id);
      this.logger.info(
        {
          jobId: job.id,
          action: job.action,
          memoryIds: job.memoryIds,
        },
        "Memory vector job processed",
      );

      return { processed: true, status: "succeeded" };
    } catch (error) {
      const failure = await this.repository.failJob({
        jobId: job.id,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        error,
      });

      this.logger.error(
        {
          jobId: job.id,
          retryable: failure.retryable,
          error,
        },
        "Memory vector job failed",
      );

      if (failure.retryable) {
        return { processed: true, status: "retry_scheduled" };
      }

      throw error;
    }
  }
}
