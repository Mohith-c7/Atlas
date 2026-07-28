import {
  executionDispatchDeadLetterQueue,
  executionDispatchDeadLetterRoutingKey,
  executionDispatchExchange,
  executionDispatchMessageSchema,
  executionDispatchQueue,
  executionDispatchRoutingKey,
  type ExecutionDispatchMessage,
} from "@faios/contracts";
import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import type { ExecutionWorker } from "./execution-worker.js";

type ConsumerLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

export const defaultExecutionWorkerConcurrency = 1;
export const maxExecutionWorkerConcurrency = 100;

export type ExecutionConsumerMetrics = {
  setQueueDepth?(queueDepth: number): void;
  recordDeadLettered?(): void;
};

export type RabbitMqExecutionConsumerOptions = {
  readonly concurrency?: number;
  readonly metrics?: ExecutionConsumerMetrics;
};

type RabbitMqTopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue" | "prefetch"
>;

export function resolveExecutionWorkerConcurrency(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number(value ?? defaultExecutionWorkerConcurrency);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxExecutionWorkerConcurrency) {
    throw new Error(
      `WORKER_EXECUTION_CONCURRENCY must be an integer between 1 and ${maxExecutionWorkerConcurrency}.`,
    );
  }

  return parsed;
}

export async function assertExecutionConsumerTopology(
  channel: RabbitMqTopologyChannel,
  options: RabbitMqExecutionConsumerOptions = {},
): Promise<number> {
  const concurrency = resolveExecutionWorkerConcurrency(
    options.concurrency ?? defaultExecutionWorkerConcurrency,
  );

  await channel.assertExchange(executionDispatchExchange, "direct", {
    durable: true,
  });
  await channel.assertQueue(executionDispatchDeadLetterQueue, {
    durable: true,
  });
  const assertedQueue = await channel.assertQueue(executionDispatchQueue, {
    durable: true,
    deadLetterExchange: executionDispatchExchange,
    deadLetterRoutingKey: executionDispatchDeadLetterRoutingKey,
  });
  options.metrics?.setQueueDepth?.(assertedQueue.messageCount);
  await channel.bindQueue(
    executionDispatchDeadLetterQueue,
    executionDispatchExchange,
    executionDispatchDeadLetterRoutingKey,
  );
  await channel.bindQueue(
    executionDispatchQueue,
    executionDispatchExchange,
    executionDispatchRoutingKey,
  );
  await channel.prefetch(concurrency);

  return concurrency;
}

export class RabbitMqExecutionConsumer {
  public constructor(
    private readonly rabbitMqUrl: string,
    private readonly worker: ExecutionWorker,
    private readonly logger: ConsumerLogger,
    private readonly options: RabbitMqExecutionConsumerOptions = {},
  ) {}

  public async start(): Promise<void> {
    const connection = await amqp.connect(this.rabbitMqUrl);
    const channel = await connection.createChannel();

    const concurrency = await assertExecutionConsumerTopology(channel, this.options);

    await channel.consume(executionDispatchQueue, (message) => {
      if (!message) {
        return;
      }

      void this.handleMessage(channel, message);
    });

    this.logger.info(
      {
        queue: executionDispatchQueue,
        deadLetterQueue: executionDispatchDeadLetterQueue,
        concurrency,
      },
      "RabbitMQ execution consumer started",
    );
  }

  public async handleMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
    const parsed = this.parseMessage(message);

    if (!parsed) {
      channel.ack(message);
      return;
    }

    try {
      const result = await this.worker.runInvocation(parsed.invocationId);

      this.logger.info(
        {
          invocationId: parsed.invocationId,
          commandId: parsed.commandId,
          correlationId: parsed.correlationId,
          result,
        },
        "Processed execution dispatch message",
      );
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        {
          invocationId: parsed.invocationId,
          commandId: parsed.commandId,
          correlationId: parsed.correlationId,
          error,
        },
        "Execution dispatch message failed",
      );
      channel.nack(message, false, false);
      this.options.metrics?.recordDeadLettered?.();
    }
  }

  private parseMessage(message: ConsumeMessage): ExecutionDispatchMessage | undefined {
    try {
      const payload = JSON.parse(message.content.toString("utf8")) as unknown;
      const parsed = executionDispatchMessageSchema.safeParse(payload);

      if (!parsed.success) {
        this.logger.warn(
          {
            routingKey: message.fields.routingKey,
            errors: parsed.error.flatten(),
          },
          "Discarding invalid execution dispatch message",
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
        "Discarding unreadable execution dispatch message",
      );
      return undefined;
    }
  }
}
