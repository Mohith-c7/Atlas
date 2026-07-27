import {
  executionDispatchExchange,
  executionDispatchQueue,
  executionDispatchRoutingKey,
  type ExecutionDispatchMessage,
  type ExecutionJob,
} from "@faios/contracts";
import amqp from "amqplib";

export interface ExecutionDispatcher {
  dispatch(jobs: ExecutionJob[], correlationId: string): Promise<void>;
}

export class NoopExecutionDispatcher implements ExecutionDispatcher {
  public dispatch(): Promise<void> {
    return Promise.resolve();
  }
}

export class RabbitMqExecutionDispatcher implements ExecutionDispatcher {
  public constructor(private readonly rabbitMqUrl: string) {}

  public async dispatch(jobs: ExecutionJob[], correlationId: string): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    const connection = await amqp.connect(this.rabbitMqUrl);

    try {
      const channel = await connection.createConfirmChannel();

      try {
        await channel.assertExchange(executionDispatchExchange, "direct", {
          durable: true,
        });
        await channel.assertQueue(executionDispatchQueue, {
          durable: true,
        });
        await channel.bindQueue(
          executionDispatchQueue,
          executionDispatchExchange,
          executionDispatchRoutingKey,
        );

        for (const job of jobs) {
          const message: ExecutionDispatchMessage = {
            schemaVersion: 1,
            eventType: "execution.invocation.queued",
            invocationId: job.invocationId,
            commandId: job.commandId,
            founderId: job.founderId,
            capabilityKey: job.capabilityKey,
            provider: job.provider,
            correlationId,
            enqueuedAt: new Date().toISOString(),
          };

          const accepted = channel.publish(
            executionDispatchExchange,
            executionDispatchRoutingKey,
            Buffer.from(JSON.stringify(message)),
            {
              contentType: "application/json",
              deliveryMode: 2,
              messageId: job.invocationId,
              correlationId,
              timestamp: Math.floor(Date.now() / 1000),
            },
          );

          if (!accepted) {
            await new Promise<void>((resolve) => channel.once("drain", resolve));
          }
        }

        await channel.waitForConfirms();
      } finally {
        await channel.close();
      }
    } finally {
      await connection.close();
    }
  }
}

export const createExecutionDispatcher = (): ExecutionDispatcher => {
  if (process.env.EXECUTION_DISPATCH_ENABLED !== "true") {
    return new NoopExecutionDispatcher();
  }

  const rabbitMqUrl = process.env.RABBITMQ_URL;

  if (!rabbitMqUrl) {
    return new NoopExecutionDispatcher();
  }

  return new RabbitMqExecutionDispatcher(rabbitMqUrl);
};
