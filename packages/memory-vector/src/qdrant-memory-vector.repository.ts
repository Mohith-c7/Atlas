import { createHash } from "node:crypto";

type QdrantPoint = {
  readonly id: string;
  readonly vector: readonly number[];
  readonly payload: Record<string, unknown>;
};

export type QdrantMemorySearchMatch = {
  readonly id: string;
  readonly memoryId: string;
  readonly score: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readVectorDimensions(): number {
  const dimensions = Number(process.env.MEMORY_EMBEDDING_DIMENSIONS ?? "1536");

  return Number.isInteger(dimensions) && dimensions > 0 ? dimensions : 1536;
}

export function toQdrantPointId(memoryId: string): string {
  const hash = createHash("sha256").update(memoryId).digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

export class QdrantMemoryVectorRepository {
  public constructor(
    private readonly baseUrl = process.env.QDRANT_URL ?? "http://localhost:6333",
    private readonly collectionName = process.env.QDRANT_MEMORY_COLLECTION ?? "faios_memory",
    private readonly vectorDimensions = readVectorDimensions(),
  ) {}

  public async ensureCollection(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
      method: "GET",
    });

    if (response.ok) {
      return;
    }

    if (response.status !== 404) {
      throw new Error(`Qdrant collection check failed with status ${response.status}.`);
    }

    const createResponse = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        vectors: {
          size: this.vectorDimensions,
          distance: "Cosine",
        },
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Qdrant collection creation failed with status ${createResponse.status}.`);
    }
  }

  public async upsertMemoryVectors(
    inputs: ReadonlyArray<{
      id: string;
      founderId: string;
      vector: readonly number[];
      content: string;
      kind: string;
    }>,
  ): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    await this.ensureCollection();
    await this.upsertPoints(
      inputs.map((input) => ({
        id: toQdrantPointId(input.id),
        vector: input.vector,
        payload: {
          memoryId: input.id,
          founderId: input.founderId,
          content: input.content,
          kind: input.kind,
        },
      })),
    );
  }

  public async deleteMemoryVectors(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.ensureCollection();
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collectionName}/points/delete?wait=true`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          points: ids.map(toQdrantPointId),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Qdrant memory delete failed with status ${response.status}.`);
    }
  }

  public async searchSimilarMemory(input: {
    founderId: string;
    vector: readonly number[];
    limit: number;
  }): Promise<QdrantMemorySearchMatch[]> {
    await this.ensureCollection();
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collectionName}/points/search`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          vector: input.vector,
          limit: input.limit,
          filter: {
            must: [
              {
                key: "founderId",
                match: {
                  value: input.founderId,
                },
              },
            ],
          },
          with_payload: true,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Qdrant memory search failed with status ${response.status}.`);
    }

    const payload: unknown = await response.json();

    if (!isRecord(payload) || !Array.isArray(payload.result)) {
      return [];
    }

    return payload.result
      .map((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.score !== "number") {
          return undefined;
        }

        const memoryId = isRecord(item.payload) ? item.payload.memoryId : undefined;

        if (typeof memoryId !== "string") {
          return undefined;
        }

        return {
          id: item.id,
          memoryId,
          score: Math.max(0, Math.min(1, item.score)),
        };
      })
      .filter((item): item is QdrantMemorySearchMatch => Boolean(item));
  }

  private async upsertPoints(points: QdrantPoint[]): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collectionName}/points?wait=true`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          points,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Qdrant memory upsert failed with status ${response.status}.`);
    }
  }
}
