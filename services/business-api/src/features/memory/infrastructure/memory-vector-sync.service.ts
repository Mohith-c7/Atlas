import { randomUUID } from "node:crypto";
import type { MemoryItem } from "@faios/contracts";
import {
  memoryVectorJobExchange,
  memoryVectorJobQueue,
  memoryVectorJobRoutingKey,
  type MemoryVectorJobAction,
  type MemoryVectorJobMessage,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import amqp from "amqplib";

type VectorSyncMode = "async" | "disabled";

function readVectorSyncMode(): VectorSyncMode {
  const mode = process.env.MEMORY_VECTOR_SYNC_MODE;

  return mode === "disabled" ? mode : "async";
}

const readMemoryVectorQueueName = () =>
  process.env.MEMORY_VECTOR_QUEUE_NAME ?? memoryVectorJobQueue;

function readMaxRetries(): number {
  const value = Number(process.env.MEMORY_VECTOR_JOB_MAX_ATTEMPTS ?? "5");
  const maxAttempts = Number.isInteger(value) && value > 0 ? value : 5;

  return Math.max(0, maxAttempts - 1);
}

export class MemoryVectorSyncService {
  private readonly syncMode: VectorSyncMode;

  public constructor(
    private readonly database: PrismaClient,
    input?: {
      syncMode?: VectorSyncMode;
    },
  ) {
    this.syncMode = input?.syncMode ?? readVectorSyncMode();
  }

  public async scheduleUpsert(founderId: string, memories: readonly MemoryItem[]): Promise<void> {
    if (this.syncMode === "disabled" || memories.length === 0) {
      return;
    }

    await this.enqueueJob({
      founderId,
      action: "upsert",
      memoryIds: memories.map((memory) => memory.id),
    });
  }

  public async scheduleDelete(founderId: string, memoryIds: readonly string[]): Promise<void> {
    if (this.syncMode === "disabled" || memoryIds.length === 0) {
      return;
    }

    await this.enqueueJob({
      founderId,
      action: "delete",
      memoryIds,
    });
  }

  private async enqueueJob(input: {
    founderId: string;
    action: MemoryVectorJobAction;
    memoryIds: readonly string[];
  }): Promise<void> {
    const memoryIds = [...new Set(input.memoryIds)].sort();

    if (memoryIds.length === 0) {
      return;
    }

    const job = await this.database.memoryVectorJob.create({
      data: {
        founderId: input.founderId,
        action: input.action,
        memoryIds,
        idempotencyKey: `${input.action}:${input.founderId}:${memoryIds.join(",")}:${randomUUID()}`,
        correlationId: undefined,
        maxRetries: readMaxRetries(),
      },
    });

    await this.publishJob({
      schemaVersion: 1,
      eventType: "memory.vector-job.queued",
      jobId: job.id,
      founderId: input.founderId,
      action: input.action,
      memoryIds,
      enqueuedAt: new Date().toISOString(),
    });
  }

  private async publishJob(message: MemoryVectorJobMessage): Promise<void> {
    if (process.env.MEMORY_VECTOR_JOB_DISPATCH_ENABLED !== "true") {
      return;
    }

    const rabbitMqUrl = process.env.RABBITMQ_URL;

    if (!rabbitMqUrl) {
      return;
    }

    const connection = await amqp.connect(rabbitMqUrl);

    try {
      const channel = await connection.createConfirmChannel();

      try {
        await channel.assertExchange(memoryVectorJobExchange, "direct", {
          durable: true,
        });
        const queueName = readMemoryVectorQueueName();

        await channel.assertQueue(queueName, {
          durable: true,
        });
        await channel.bindQueue(queueName, memoryVectorJobExchange, memoryVectorJobRoutingKey);

        channel.publish(
          memoryVectorJobExchange,
          memoryVectorJobRoutingKey,
          Buffer.from(JSON.stringify(message)),
          {
            contentType: "application/json",
            deliveryMode: 2,
            messageId: message.jobId,
            correlationId: message.correlationId,
            timestamp: Math.floor(Date.now() / 1000),
          },
        );
        await channel.waitForConfirms();
      } finally {
        await channel.close();
      }
    } finally {
      await connection.close();
    }
  }
}
