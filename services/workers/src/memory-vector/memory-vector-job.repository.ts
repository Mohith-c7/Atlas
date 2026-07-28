import type { MemoryVectorJobAction } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";

type MemoryVectorJobRecord = {
  readonly id: string;
  readonly founderId: string;
  readonly action: MemoryVectorJobAction;
  readonly memoryIds: string[];
  readonly status: string;
  readonly retryCount: number;
  readonly maxRetries: number;
};

type MemoryRecord = {
  readonly id: string;
  readonly kind: string;
  readonly content: string;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
};

const isMemoryVectorJobAction = (value: string): value is MemoryVectorJobAction =>
  value === "upsert" || value === "delete";

function readRetryBaseDelayMs(): number {
  const value = Number(process.env.MEMORY_VECTOR_RETRY_BASE_DELAY_MS ?? "1000");

  return Number.isInteger(value) && value > 0 ? value : 1000;
}

function readRetryMaxDelayMs(): number {
  const value = Number(process.env.MEMORY_VECTOR_RETRY_MAX_DELAY_MS ?? "60000");

  return Number.isInteger(value) && value > 0 ? value : 60000;
}

function calculateMemoryVectorRetryDecision(input: {
  retryCount: number;
  maxRetries: number;
  now?: Date;
}):
  | {
      readonly shouldRetry: true;
      readonly retryCount: number;
      readonly nextAttemptAt: Date;
    }
  | {
      readonly shouldRetry: false;
    } {
  if (input.retryCount >= input.maxRetries) {
    return { shouldRetry: false };
  }

  const baseDelayMs = readRetryBaseDelayMs();
  const maxDelayMs = readRetryMaxDelayMs();
  const nextRetryCount = input.retryCount + 1;
  const delayMs = Math.min(baseDelayMs * 2 ** Math.max(nextRetryCount - 1, 0), maxDelayMs);

  return {
    shouldRetry: true,
    retryCount: nextRetryCount,
    nextAttemptAt: new Date((input.now ?? new Date()).getTime() + delayMs),
  };
}

export class MemoryVectorJobRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async claimJob(jobId: string): Promise<MemoryVectorJobRecord | undefined> {
    return this.database.$transaction(async (transaction) => {
      const job = await transaction.memoryVectorJob.findUnique({
        where: {
          id: jobId,
        },
      });

      if (!job || job.status !== "PENDING") {
        return undefined;
      }

      if (job.nextAttemptAt && job.nextAttemptAt > new Date()) {
        return undefined;
      }

      const claimed = await transaction.memoryVectorJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });

      if (!isMemoryVectorJobAction(claimed.action)) {
        throw new Error(`Unsupported memory vector job action: ${claimed.action}.`);
      }

      return {
        id: claimed.id,
        founderId: claimed.founderId,
        action: claimed.action,
        memoryIds: claimed.memoryIds,
        status: claimed.status,
        retryCount: claimed.retryCount,
        maxRetries: claimed.maxRetries,
      };
    });
  }

  public async listActiveMemories(input: {
    founderId: string;
    memoryIds: readonly string[];
  }): Promise<MemoryRecord[]> {
    return this.database.memoryItem.findMany({
      where: {
        founderId: input.founderId,
        id: {
          in: [...input.memoryIds],
        },
        archivedAt: null,
        deletedAt: null,
      },
    });
  }

  public async updateVectorRefs(input: {
    founderId: string;
    memoryIds: readonly string[];
    vectorRef: string | null;
  }): Promise<void> {
    if (input.memoryIds.length === 0) {
      return;
    }

    await this.database.memoryItem.updateMany({
      where: {
        founderId: input.founderId,
        id: {
          in: [...input.memoryIds],
        },
      },
      data: {
        vectorRef: input.vectorRef,
      },
    });
  }

  public async completeJob(jobId: string): Promise<void> {
    await this.database.memoryVectorJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  public async failJob(input: {
    jobId: string;
    retryCount: number;
    maxRetries: number;
    error: unknown;
  }): Promise<{ retryable: boolean }> {
    const message =
      input.error instanceof Error ? input.error.message : "Unknown memory vector job error.";
    const decision = calculateMemoryVectorRetryDecision({
      retryCount: input.retryCount,
      maxRetries: input.maxRetries,
    });

    if (decision.shouldRetry) {
      await this.database.memoryVectorJob.update({
        where: {
          id: input.jobId,
        },
        data: {
          status: "PENDING",
          retryCount: decision.retryCount,
          nextAttemptAt: decision.nextAttemptAt,
          errorCode: "MEMORY_VECTOR_JOB_RETRY",
          errorMessage: message,
        },
      });

      return { retryable: true };
    }

    await this.database.memoryVectorJob.update({
      where: {
        id: input.jobId,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: "MEMORY_VECTOR_JOB_FAILED",
        errorMessage: message,
      },
    });

    return { retryable: false };
  }
}
