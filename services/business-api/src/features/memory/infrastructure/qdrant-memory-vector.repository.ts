type QdrantPoint = {
  readonly id: string;
  readonly vector: readonly number[];
  readonly payload: Record<string, unknown>;
};

export type QdrantMemorySearchMatch = {
  readonly id: string;
  readonly score: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export class QdrantMemoryVectorRepository {
  public constructor(
    private readonly baseUrl = process.env.QDRANT_URL ?? "http://localhost:6333",
    private readonly collectionName = process.env.QDRANT_MEMORY_COLLECTION ?? "faios_memory",
  ) {}

  public async upsertMemoryVector(input: {
    id: string;
    founderId: string;
    vector: readonly number[];
    content: string;
    kind: string;
  }): Promise<void> {
    await this.upsertPoints([
      {
        id: input.id,
        vector: input.vector,
        payload: {
          founderId: input.founderId,
          content: input.content,
          kind: input.kind,
        },
      },
    ]);
  }

  public async searchSimilarMemory(input: {
    founderId: string;
    vector: readonly number[];
    limit: number;
  }): Promise<QdrantMemorySearchMatch[]> {
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

        return {
          id: item.id,
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
