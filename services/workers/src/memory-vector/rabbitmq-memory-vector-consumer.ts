import {
  memoryVectorJobDeadLetterQueue,
  memoryVectorJobDeadLetterRoutingKey,
  memoryVectorJobExchange,
  memoryVectorJobMessageSchema,
  memoryVectorJobQueue,
  memoryVectorJobRoutingKey,
  type MemoryVectorJobMessage,
} from "@faios/contracts";
import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import type { MemoryVectorWorker } from "./memory-vector-worker.js";
import { MemoryVectorJobMetrics } from "./memory-vector-job.metrics.js";

type ConsumerLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

export const defaultMemoryVectorWorkerConcurrency = 4;
export const maxMemoryVectorWorkerConcurrency = 100;

export type MemoryVectorConsumerMetrics = {
  setQueueDepth?(queueDepth: number): void;
  recordDeadLettered?(): void;
};

export type RabbitMqMemoryVectorConsumerOptions = {
  readonly queueName?: string;
  readonly deadLetterQueueName?: string;
  readonly concurrency?: number;
  readonly metrics?: MemoryVectorConsumerMetrics;
};

type RabbitMqTopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue" | "prefetch"
>;

export function resolveMemoryVectorWorkerConcurrency(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number(value ?? defaultMemoryVectorWorkerConcurrency);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxMemoryVectorWorkerConcurrency) {
    throw new Error(
      `MEMORY_VECTOR_WORKER_CONCURRENCY must be an integer between 1 and ${maxMemoryVectorWorkerConcurrency}.`,
    );
  }

  return parsed;
}

export async function assertMemoryVectorConsumerTopology(
  channel: RabbitMqTopologyChannel,
  options: RabbitMqMemoryVectorConsumerOptions = {},
): Promise<{
  readonly queueName: string;
  readonly deadLetterQueueName: string;
  readonly concurrency: number;
}> {
  const queueName = options.queueName ?? memoryVectorJobQueue;
  const deadLetterQueueName = options.deadLetterQueueName ?? memoryVectorJobDeadLetterQueue;
  const concurrency = resolveMemoryVectorWorkerConcurrency(
    options.concurrency ?? defaultMemoryVectorWorkerConcurrency,
  );

  await channel.assertExchange(memoryVectorJobExchange, "direct", {
    durable: true,
  });
  await channel.assertQueue(deadLetterQueueName, {
    durable: true,
  });
  const assertedQueue = await channel.assertQueue(queueName, {
    durable: true,
    deadLetterExchange: memoryVectorJobExchange,
    deadLetterRoutingKey: memoryVectorJobDeadLetterRoutingKey,
  });
  options.metrics?.setQueueDepth?.(assertedQueue.messageCount);
  await channel.bindQueue(
    deadLetterQueueName,
    memoryVectorJobExchange,
    memoryVectorJobDeadLetterRoutingKey,
  );
  await channel.bindQueue(queueName, memoryVectorJobExchange, memoryVectorJobRoutingKey);
  await channel.prefetch(concurrency);

  return {
    queueName,
    deadLetterQueueName,
    concurrency,
  };
}

export class RabbitMqMemoryVectorConsumer {
  public constructor(
    private readonly rabbitMqUrl: string,
    private readonly worker: MemoryVectorWorker,
    private readonly logger: ConsumerLogger,
    private readonly metrics = new MemoryVectorJobMetrics(),
    private readonly options: RabbitMqMemoryVectorConsumerOptions = {},
  ) {}

  public async start(): Promise<void> {
    const connection = await amqp.connect(this.rabbitMqUrl);
    const channel = await connection.createChannel();

    const topology = await assertMemoryVectorConsumerTopology(channel, {
      ...this.options,
      metrics: this.metrics,
    });

    await channel.consume(topology.queueName, (message) => {
      if (!message) {
        return;
      }

      void this.handleMessage(channel, message);
    });

    this.logger.info(
      {
        queue: memoryVectorJobQueue,
        configuredQueue: topology.queueName,
        deadLetterQueue: topology.deadLetterQueueName,
        concurrency: topology.concurrency,
      },
      "RabbitMQ memory vector consumer started",
    );
  }

  public async handleMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
    const parsed = this.parseMessage(message);

    if (!parsed) {
      channel.ack(message);
      return;
    }

    try {
      const result = await this.worker.runJob(parsed.jobId);

      this.logger.info(
        {
          jobId: parsed.jobId,
          founderId: parsed.founderId,
          correlationId: parsed.correlationId,
          result,
        },
        "Processed memory vector job message",
      );
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        {
          jobId: parsed.jobId,
          founderId: parsed.founderId,
          correlationId: parsed.correlationId,
          error,
        },
        "Memory vector job message failed",
      );
      channel.nack(message, false, false);
      this.metrics.recordDeadLettered();
    }
  }

  private parseMessage(message: ConsumeMessage): MemoryVectorJobMessage | undefined {
    try {
      const payload = JSON.parse(message.content.toString("utf8")) as unknown;
      const parsed = memoryVectorJobMessageSchema.safeParse(payload);

      if (!parsed.success) {
        this.logger.warn(
          {
            routingKey: message.fields.routingKey,
            errors: parsed.error.flatten(),
          },
          "Discarding invalid memory vector job message",
        );
        return undefined;
      }

      return parsed.data;
    } catch (error) {
      this.logger.warn(
        {
          routingKey: message.fields.routingKey,
          error,
        },
        "Discarding unreadable memory vector job message",
      );
      return undefined;
    }
  }
}
