import {
  createMemoryEmbeddingProvider,
  QdrantMemoryVectorRepository,
  toQdrantPointId,
} from "@faios/memory-vector";
import type { MemoryEmbeddingProvider } from "@faios/memory-vector";
import type { MemoryVectorJobRepository } from "./memory-vector-job.repository.js";
import { MemoryVectorJobMetrics } from "./memory-vector-job.metrics.js";

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
    private readonly metrics = new MemoryVectorJobMetrics(),
  ) {}

  public async runJob(jobId: string): Promise<{ processed: boolean; status?: string }> {
    const startedAt = Date.now();
    const job = await this.repository.claimJob(jobId);

    if (!job) {
      this.metrics.recordProcessed("skipped", Date.now() - startedAt);
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
            vector: await this.embedMemoryText(`${memory.kind.toLowerCase()}\n${memory.content}`),
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

      this.metrics.recordProcessed("succeeded", Date.now() - startedAt);
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
        this.metrics.recordProcessed("retry_scheduled", Date.now() - startedAt);
        return { processed: true, status: "retry_scheduled" };
      }

      this.metrics.recordProcessed("failed", Date.now() - startedAt);
      throw error;
    }
  }

  private async embedMemoryText(text: string): Promise<number[]> {
    const startedAt = Date.now();

    try {
      return await this.embeddingProvider.embedText(text);
    } finally {
      this.metrics.recordProviderLatency(Date.now() - startedAt);
    }
  }
}
