import {
  executionDispatchExchange,
  executionDispatchQueue,
  executionDispatchRoutingKey,
  type ExecutionDispatchMessage,
} from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import amqp, { type Channel } from "amqplib";
import { ExecutionRepository } from "../execution/execution.repository.js";
import { ExecutionWorker } from "../execution/execution-worker.js";
import { RegistryMcpToolExecutor } from "../execution/registry-mcp-tool-executor.js";

const database = getPrismaClient();
const rabbitMqUrl = process.env.RABBITMQ_URL ?? "amqp://faios:faios@localhost:5672";

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function receiveMessage(channel: Channel) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const message = await channel.get(executionDispatchQueue, {
      noAck: false,
    });

    if (message) {
      return message;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for RabbitMQ execution dispatch message.");
}

async function main() {
  const suffix = Date.now().toString(36);
  const founder = await database.founderAccount.create({
    data: {
      email: `integration-${suffix}@faios.local`,
      displayName: "Integration Founder",
    },
  });
  const conversation = await database.conversation.create({
    data: {
      founderId: founder.id,
      channel: "CHAT",
      title: "Runtime integration",
    },
  });
  const command = await database.command.create({
    data: {
      founderId: founder.id,
      conversationId: conversation.id,
      source: "CHAT",
      rawInput: "Create a Jira task",
      status: "EXECUTING",
      summary: "Create a Jira task",
    },
  });
  const invocation = await database.toolInvocation.create({
    data: {
      commandId: command.id,
      capabilityKey: "task.create",
      provider: "jira",
      status: "PENDING",
      requestPayload: {
        title: "Runtime integration task",
        apiKey: "must-not-survive",
      },
    },
  });

  const connection = await amqp.connect(rabbitMqUrl);
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
    await channel.purgeQueue(executionDispatchQueue);

    const message: ExecutionDispatchMessage = {
      schemaVersion: 1,
      eventType: "execution.invocation.queued",
      invocationId: invocation.id,
      commandId: command.id,
      founderId: founder.id,
      capabilityKey: invocation.capabilityKey,
      provider: invocation.provider,
      correlationId: `corr_${suffix}`,
      enqueuedAt: new Date().toISOString(),
    };

    channel.publish(
      executionDispatchExchange,
      executionDispatchRoutingKey,
      Buffer.from(JSON.stringify(message)),
      {
        contentType: "application/json",
        deliveryMode: 2,
        messageId: invocation.id,
        correlationId: message.correlationId,
      },
    );
    await channel.waitForConfirms();

    const received = await receiveMessage(channel);
    const worker = new ExecutionWorker(
      new ExecutionRepository(database),
      new RegistryMcpToolExecutor(),
      logger,
    );
    const result = await worker.runInvocation(invocation.id);
    channel.ack(received);

    if (!result.processed || result.status !== "succeeded") {
      throw new Error(`Expected successful worker result, received ${JSON.stringify(result)}.`);
    }

    const updatedInvocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: invocation.id,
      },
    });
    const updatedCommand = await database.command.findUniqueOrThrow({
      where: {
        id: command.id,
      },
    });

    if (updatedInvocation.status !== "SUCCEEDED") {
      throw new Error(`Expected invocation SUCCEEDED, received ${updatedInvocation.status}.`);
    }

    if (updatedCommand.status !== "COMPLETED") {
      throw new Error(`Expected command COMPLETED, received ${updatedCommand.status}.`);
    }

    if (JSON.stringify(updatedInvocation.responsePayload).includes("must-not-survive")) {
      throw new Error("Sensitive response payload was not redacted.");
    }
  } finally {
    await channel.close();
    await connection.close();
    await database.founderAccount.delete({
      where: {
        id: founder.id,
      },
    });
    await database.$disconnect();
  }
}

await main();
