import { strict as assert } from "node:assert";
import {
  executionDispatchDeadLetterQueue,
  executionDispatchDeadLetterRoutingKey,
  executionDispatchExchange,
  executionDispatchQueue,
  executionDispatchRoutingKey,
  memoryVectorJobDeadLetterRoutingKey,
  memoryVectorJobExchange,
  memoryVectorJobRoutingKey,
  type ExecutionDispatchMessage,
  type MemoryVectorJobMessage,
} from "@faios/contracts";
import { serverEnvSchema } from "@faios/env";
import type { Channel, ConsumeMessage } from "amqplib";
import {
  assertExecutionConsumerTopology,
  RabbitMqExecutionConsumer,
  resolveExecutionWorkerConcurrency,
} from "../execution/rabbitmq-execution-consumer.js";
import {
  assertMemoryVectorConsumerTopology,
  RabbitMqMemoryVectorConsumer,
  resolveMemoryVectorWorkerConcurrency,
} from "../memory-vector/rabbitmq-memory-vector-consumer.js";
import { MemoryVectorJobMetrics } from "../memory-vector/memory-vector-job.metrics.js";

type QueueOptions = {
  durable?: boolean;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
};

class FakeTopologyChannel {
  public readonly exchanges: Array<{ name: string; type: string; durable?: boolean }> = [];
  public readonly queues: Array<{ name: string; options: QueueOptions }> = [];
  public readonly bindings: Array<{ queue: string; exchange: string; routingKey: string }> = [];
  public readonly prefetchValues: number[] = [];

  public assertExchange(name: string, type: string, options?: { durable?: boolean }) {
    this.exchanges.push({ name, type, durable: options?.durable });

    return Promise.resolve({ exchange: name });
  }

  public assertQueue(name: string, options?: QueueOptions) {
    this.queues.push({ name, options: options ?? {} });

    return Promise.resolve({
      queue: name,
      messageCount: 7,
      consumerCount: 0,
    });
  }

  public bindQueue(queue: string, exchange: string, routingKey: string) {
    this.bindings.push({ queue, exchange, routingKey });

    return Promise.resolve({ queue });
  }

  public prefetch(value: number) {
    this.prefetchValues.push(value);

    return Promise.resolve();
  }
}

class FakeDeliveryChannel {
  public readonly acks: ConsumeMessage[] = [];
  public readonly nacks: Array<{
    message: ConsumeMessage;
    allUpTo: boolean;
    requeue: boolean;
  }> = [];

  public ack(message: ConsumeMessage): void {
    this.acks.push(message);
  }

  public nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void {
    this.nacks.push({
      message,
      allUpTo: allUpTo ?? false,
      requeue: requeue ?? true,
    });
  }
}

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function main(): Promise<void> {
  await verifiesExecutionTopologyAndConcurrency();
  await verifiesMemoryVectorTopologyAndConcurrency();
  verifiesBackpressureEnvValidation();
  await verifiesExecutionDeadLetterMetrics();
  await verifiesMemoryVectorDeadLetterMetrics();
}

async function verifiesExecutionTopologyAndConcurrency(): Promise<void> {
  let queueDepth: number | undefined;
  const channel = new FakeTopologyChannel();
  const concurrency = await assertExecutionConsumerTopology(channel as unknown as Channel, {
    concurrency: 8,
    metrics: {
      setQueueDepth: (value) => {
        queueDepth = value;
      },
    },
  });

  assert.equal(concurrency, 8);
  assert.equal(queueDepth, 7);
  assert.deepEqual(channel.prefetchValues, [8]);
  assert.deepEqual(channel.exchanges, [
    { name: executionDispatchExchange, type: "direct", durable: true },
  ]);
  assert.deepEqual(channel.queues.find((queue) => queue.name === executionDispatchQueue)?.options, {
    durable: true,
    deadLetterExchange: executionDispatchExchange,
    deadLetterRoutingKey: executionDispatchDeadLetterRoutingKey,
  });
  assert.deepEqual(channel.bindings, [
    {
      queue: executionDispatchDeadLetterQueue,
      exchange: executionDispatchExchange,
      routingKey: executionDispatchDeadLetterRoutingKey,
    },
    {
      queue: executionDispatchQueue,
      exchange: executionDispatchExchange,
      routingKey: executionDispatchRoutingKey,
    },
  ]);
}

async function verifiesMemoryVectorTopologyAndConcurrency(): Promise<void> {
  const channel = new FakeTopologyChannel();
  const metrics = new MemoryVectorJobMetrics();
  const topology = await assertMemoryVectorConsumerTopology(channel as unknown as Channel, {
    concurrency: 6,
    queueName: "custom.memory.queue",
    deadLetterQueueName: "custom.memory.dlq",
    metrics,
  });

  assert.deepEqual(topology, {
    queueName: "custom.memory.queue",
    deadLetterQueueName: "custom.memory.dlq",
    concurrency: 6,
  });
  assert.deepEqual(channel.prefetchValues, [6]);
  assert.deepEqual(channel.exchanges, [
    { name: memoryVectorJobExchange, type: "direct", durable: true },
  ]);
  assert.deepEqual(channel.queues.find((queue) => queue.name === "custom.memory.queue")?.options, {
    durable: true,
    deadLetterExchange: memoryVectorJobExchange,
    deadLetterRoutingKey: memoryVectorJobDeadLetterRoutingKey,
  });
  assert.deepEqual(channel.bindings, [
    {
      queue: "custom.memory.dlq",
      exchange: memoryVectorJobExchange,
      routingKey: memoryVectorJobDeadLetterRoutingKey,
    },
    {
      queue: "custom.memory.queue",
      exchange: memoryVectorJobExchange,
      routingKey: memoryVectorJobRoutingKey,
    },
  ]);
  assert.equal(metrics.snapshot().queueDepth, 7);
}

function verifiesBackpressureEnvValidation(): void {
  assert.equal(resolveExecutionWorkerConcurrency("12"), 12);
  assert.equal(resolveMemoryVectorWorkerConcurrency("16"), 16);
  assert.throws(() => resolveExecutionWorkerConcurrency("0"), /WORKER_EXECUTION_CONCURRENCY/);
  assert.throws(
    () => resolveMemoryVectorWorkerConcurrency("101"),
    /MEMORY_VECTOR_WORKER_CONCURRENCY/,
  );

  const parsed = serverEnvSchema.parse({
    DATABASE_URL: "postgresql://faios:faios@localhost:5432/faios?schema=public",
    REDIS_URL: "redis://localhost:6379",
    RABBITMQ_URL: "amqp://faios:faios@localhost:5672",
    QDRANT_URL: "http://localhost:6333",
    WORKER_EXECUTION_CONCURRENCY: "9",
    MEMORY_VECTOR_WORKER_CONCURRENCY: "5",
  });

  assert.equal(parsed.WORKER_EXECUTION_CONCURRENCY, 9);
  assert.equal(parsed.MEMORY_VECTOR_WORKER_CONCURRENCY, 5);
  assert.throws(
    () =>
      serverEnvSchema.parse({
        DATABASE_URL: "postgresql://faios:faios@localhost:5432/faios?schema=public",
        REDIS_URL: "redis://localhost:6379",
        RABBITMQ_URL: "amqp://faios:faios@localhost:5672",
        QDRANT_URL: "http://localhost:6333",
        WORKER_EXECUTION_CONCURRENCY: "200",
      }),
    /Too big|less than or equal to 100/,
  );
}

async function verifiesExecutionDeadLetterMetrics(): Promise<void> {
  let deadLettered = 0;
  const consumer = new RabbitMqExecutionConsumer(
    "amqp://unused",
    {
      runInvocation: () => Promise.reject(new Error("synthetic execution failure")),
    } as never,
    logger,
    {
      metrics: {
        recordDeadLettered: () => {
          deadLettered += 1;
        },
      },
    },
  );
  const channel = new FakeDeliveryChannel();

  await consumer.handleMessage(
    channel as unknown as Channel,
    createConsumeMessage({
      schemaVersion: 1,
      eventType: "execution.invocation.queued",
      invocationId: "invocation_1",
      commandId: "command_1",
      founderId: "founder_1",
      capabilityKey: "task.create",
      provider: "github",
      correlationId: "corr_1",
      enqueuedAt: new Date(0).toISOString(),
    } satisfies ExecutionDispatchMessage),
  );

  assert.equal(channel.acks.length, 0);
  assert.equal(channel.nacks.length, 1);
  assert.equal(channel.nacks[0]?.requeue, false);
  assert.equal(deadLettered, 1);
}

async function verifiesMemoryVectorDeadLetterMetrics(): Promise<void> {
  const metrics = new MemoryVectorJobMetrics();
  const consumer = new RabbitMqMemoryVectorConsumer(
    "amqp://unused",
    {
      runJob: () => Promise.reject(new Error("synthetic memory vector failure")),
    } as never,
    logger,
    metrics,
  );
  const channel = new FakeDeliveryChannel();

  await consumer.handleMessage(
    channel as unknown as Channel,
    createConsumeMessage({
      schemaVersion: 1,
      eventType: "memory.vector-job.queued",
      jobId: "job_1",
      founderId: "founder_1",
      action: "upsert",
      memoryIds: ["memory_1"],
      correlationId: "corr_1",
      enqueuedAt: new Date(0).toISOString(),
    } satisfies MemoryVectorJobMessage),
  );

  assert.equal(channel.acks.length, 0);
  assert.equal(channel.nacks.length, 1);
  assert.equal(channel.nacks[0]?.requeue, false);
  assert.equal(metrics.snapshot().deadLetteredTotal, 1);
}

function createConsumeMessage(payload: unknown): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    fields: {
      consumerTag: "consumer",
      deliveryTag: 1,
      redelivered: false,
      exchange: "exchange",
      routingKey: "routing.key",
    },
    properties: {
      contentType: "application/json",
      contentEncoding: undefined,
      headers: {},
      deliveryMode: 2,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  };
}

await main();
