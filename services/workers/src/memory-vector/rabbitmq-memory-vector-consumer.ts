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

type ConsumerLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

function readWorkerConcurrency(): number {
  const value = Number(process.env.MEMORY_VECTOR_WORKER_CONCURRENCY ?? "4");

  return Number.isInteger(value) && value > 0 ? value : 4;
}

export class RabbitMqMemoryVectorConsumer {
  public constructor(
    private readonly rabbitMqUrl: string,
    private readonly worker: MemoryVectorWorker,
    private readonly logger: ConsumerLogger,
  ) {}

  public async start(): Promise<void> {
    const connection = await amqp.connect(this.rabbitMqUrl);
    const channel = await connection.createChannel();

    await channel.assertExchange(memoryVectorJobExchange, "direct", {
      durable: true,
    });
    const queueName = process.env.MEMORY_VECTOR_QUEUE_NAME ?? memoryVectorJobQueue;
    const deadLetterQueueName =
      process.env.MEMORY_VECTOR_DEAD_LETTER_QUEUE_NAME ?? memoryVectorJobDeadLetterQueue;

    await channel.assertQueue(deadLetterQueueName, {
      durable: true,
    });
    await channel.assertQueue(queueName, {
      durable: true,
      deadLetterExchange: memoryVectorJobExchange,
      deadLetterRoutingKey: memoryVectorJobDeadLetterRoutingKey,
    });
    await channel.bindQueue(
      deadLetterQueueName,
      memoryVectorJobExchange,
      memoryVectorJobDeadLetterRoutingKey,
    );
    await channel.bindQueue(queueName, memoryVectorJobExchange, memoryVectorJobRoutingKey);
    await channel.prefetch(readWorkerConcurrency());

    await channel.consume(queueName, (message) => {
      if (!message) {
        return;
      }

      void this.handleMessage(channel, message);
    });

    this.logger.info(
      {
        queue: memoryVectorJobQueue,
        configuredQueue: queueName,
      },
      "RabbitMQ memory vector consumer started",
    );
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
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
