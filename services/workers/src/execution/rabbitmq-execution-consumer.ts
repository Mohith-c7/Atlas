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

export class RabbitMqExecutionConsumer {
  public constructor(
    private readonly rabbitMqUrl: string,
    private readonly worker: ExecutionWorker,
    private readonly logger: ConsumerLogger,
  ) {}

  public async start(): Promise<void> {
    const connection = await amqp.connect(this.rabbitMqUrl);
    const channel = await connection.createChannel();

    await channel.assertExchange(executionDispatchExchange, "direct", {
      durable: true,
    });
    await channel.assertQueue(executionDispatchDeadLetterQueue, {
      durable: true,
    });
    await channel.assertQueue(executionDispatchQueue, {
      durable: true,
      deadLetterExchange: executionDispatchExchange,
      deadLetterRoutingKey: executionDispatchDeadLetterRoutingKey,
    });
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
    await channel.prefetch(1);

    await channel.consume(executionDispatchQueue, (message) => {
      if (!message) {
        return;
      }

      void this.handleMessage(channel, message);
    });

    this.logger.info(
      {
        queue: executionDispatchQueue,
      },
      "RabbitMQ execution consumer started",
    );
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
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
