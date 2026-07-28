import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { getPrismaClient } from "@faios/database";
import {
  DeterministicMemoryEmbeddingProvider,
  type MemoryEmbeddingProvider,
} from "@faios/memory-vector";
import { MemoryVectorJobRepository } from "../memory-vector/memory-vector-job.repository.js";
import { MemoryVectorWorker } from "../memory-vector/memory-vector-worker.js";

const database = getPrismaClient();

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue ** 2;
    rightMagnitude += rightValue ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return Math.max(0, dotProduct / Math.sqrt(leftMagnitude * rightMagnitude));
}

async function createFakeQdrantServer() {
  const points = new Map<
    string,
    {
      vector: number[];
      payload: Record<string, unknown>;
    }
  >();
  let collectionReady = false;

  const server = createServer((request, response) => {
    void handleFakeQdrantRequest({
      request,
      response,
      points,
      getCollectionReady: () => collectionReady,
      setCollectionReady: () => {
        collectionReady = true;
      },
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    get pointCount() {
      return points.size;
    },
  };
}

async function handleFakeQdrantRequest(input: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly points: Map<
    string,
    {
      vector: number[];
      payload: Record<string, unknown>;
    }
  >;
  readonly getCollectionReady: () => boolean;
  readonly setCollectionReady: () => void;
}): Promise<void> {
  const { request, response, points } = input;
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (request.method === "GET" && /^\/collections\/[^/]+$/.test(pathname)) {
    sendJson(
      response,
      input.getCollectionReady() ? 200 : 404,
      input.getCollectionReady() ? { result: {} } : {},
    );

    return;
  }

  if (request.method === "PUT" && /^\/collections\/[^/]+$/.test(pathname)) {
    input.setCollectionReady();
    sendJson(response, 200, { result: true });

    return;
  }

  if (request.method === "PUT" && /^\/collections\/[^/]+\/points$/.test(pathname)) {
    const body = (await readJsonBody(request)) as {
      points?: ReadonlyArray<{
        id?: unknown;
        vector?: unknown;
        payload?: unknown;
      }>;
    };

    for (const point of body.points ?? []) {
      if (
        typeof point.id === "string" &&
        Array.isArray(point.vector) &&
        point.payload &&
        typeof point.payload === "object"
      ) {
        points.set(point.id, {
          vector: point.vector.filter((value): value is number => typeof value === "number"),
          payload: point.payload as Record<string, unknown>,
        });
      }
    }

    sendJson(response, 200, { result: true });

    return;
  }

  if (request.method === "POST" && /^\/collections\/[^/]+\/points\/search$/.test(pathname)) {
    const body = (await readJsonBody(request)) as {
      vector?: unknown;
      filter?: {
        must?: ReadonlyArray<{
          key?: unknown;
          match?: {
            value?: unknown;
          };
        }>;
      };
    };
    const founderFilter = body.filter?.must?.find((item) => item.key === "founderId")?.match?.value;
    const queryVector = Array.isArray(body.vector)
      ? body.vector.filter((value): value is number => typeof value === "number")
      : [];
    const result = [...points.entries()]
      .filter(([, point]) => point.payload.founderId === founderFilter)
      .map(([id, point]) => ({
        id,
        payload: point.payload,
        score: cosineSimilarity(queryVector, point.vector),
      }));

    sendJson(response, 200, { result });

    return;
  }

  if (request.method === "POST" && /^\/collections\/[^/]+\/points\/delete$/.test(pathname)) {
    const body = (await readJsonBody(request)) as {
      points?: readonly unknown[];
    };

    for (const pointId of body.points ?? []) {
      if (typeof pointId === "string") {
        points.delete(pointId);
      }
    }

    sendJson(response, 200, { result: true });

    return;
  }

  sendJson(response, 404, {});
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request as AsyncIterable<unknown>) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    }
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

class FailingEmbeddingProvider implements MemoryEmbeddingProvider {
  public readonly dimensions = 64;

  public embedText(): Promise<number[]> {
    return Promise.reject(new Error("Synthetic embedding failure."));
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const previousQdrantUrl = process.env.QDRANT_URL;
  const previousQdrantCollection = process.env.QDRANT_MEMORY_COLLECTION;
  const previousEmbeddingDimensions = process.env.MEMORY_EMBEDDING_DIMENSIONS;
  const qdrant = await createFakeQdrantServer();
  const founder = await database.founderAccount.create({
    data: {
      email: `memory-vector-${suffix}@faios.local`,
      displayName: "Memory Vector Founder",
    },
  });

  process.env.QDRANT_URL = qdrant.baseUrl;
  process.env.QDRANT_MEMORY_COLLECTION = `memory_vector_${suffix}`;
  process.env.MEMORY_EMBEDDING_DIMENSIONS = "64";

  try {
    const memory = await database.memoryItem.create({
      data: {
        founderId: founder.id,
        kind: "COMPANY_FACT",
        content: "Atlas AI helps solo founders operate faster.",
        source: "integration",
        confidence: 0.91,
      },
    });
    const job = await database.memoryVectorJob.create({
      data: {
        founderId: founder.id,
        action: "upsert",
        memoryIds: [memory.id],
        idempotencyKey: `upsert_${suffix}`,
      },
    });
    const worker = new MemoryVectorWorker(
      new MemoryVectorJobRepository(database),
      logger,
      new DeterministicMemoryEmbeddingProvider(64),
    );
    const result = await worker.runJob(job.id);

    if (!result.processed || result.status !== "succeeded") {
      throw new Error(`Expected vector job success, received ${JSON.stringify(result)}.`);
    }

    const updatedMemory = await database.memoryItem.findUniqueOrThrow({
      where: {
        id: memory.id,
      },
    });
    const updatedJob = await database.memoryVectorJob.findUniqueOrThrow({
      where: {
        id: job.id,
      },
    });

    if (!updatedMemory.vectorRef || updatedJob.status !== "SUCCEEDED") {
      throw new Error("Memory vector job did not persist vector status.");
    }

    const rerunResult = await worker.runJob(job.id);

    if (rerunResult.processed) {
      throw new Error("Succeeded memory vector job was processed twice.");
    }

    const deleteJob = await database.memoryVectorJob.create({
      data: {
        founderId: founder.id,
        action: "delete",
        memoryIds: [memory.id],
        idempotencyKey: `delete_${suffix}`,
      },
    });
    await worker.runJob(deleteJob.id);

    const deletedVectorMemory = await database.memoryItem.findUniqueOrThrow({
      where: {
        id: memory.id,
      },
    });

    if (deletedVectorMemory.vectorRef || qdrant.pointCount !== 0) {
      throw new Error("Memory vector delete job left stale vector state.");
    }

    const retryJob = await database.memoryVectorJob.create({
      data: {
        founderId: founder.id,
        action: "upsert",
        memoryIds: [memory.id],
        idempotencyKey: `retry_${suffix}`,
      },
    });
    const failingWorker = new MemoryVectorWorker(
      new MemoryVectorJobRepository(database),
      logger,
      new FailingEmbeddingProvider(),
    );
    const retryResult = await failingWorker.runJob(retryJob.id);
    const retriedJob = await database.memoryVectorJob.findUniqueOrThrow({
      where: {
        id: retryJob.id,
      },
    });

    if (
      retryResult.status !== "retry_scheduled" ||
      retriedJob.status !== "PENDING" ||
      retriedJob.retryCount !== 1 ||
      !retriedJob.nextAttemptAt
    ) {
      throw new Error("Memory vector failure did not schedule a retry.");
    }
  } finally {
    if (previousQdrantUrl === undefined) {
      delete process.env.QDRANT_URL;
    } else {
      process.env.QDRANT_URL = previousQdrantUrl;
    }

    if (previousQdrantCollection === undefined) {
      delete process.env.QDRANT_MEMORY_COLLECTION;
    } else {
      process.env.QDRANT_MEMORY_COLLECTION = previousQdrantCollection;
    }

    if (previousEmbeddingDimensions === undefined) {
      delete process.env.MEMORY_EMBEDDING_DIMENSIONS;
    } else {
      process.env.MEMORY_EMBEDDING_DIMENSIONS = previousEmbeddingDimensions;
    }

    await qdrant.close();
    await database.founderAccount.delete({
      where: {
        id: founder.id,
      },
    });
    await database.$disconnect();
  }
}

await main();
