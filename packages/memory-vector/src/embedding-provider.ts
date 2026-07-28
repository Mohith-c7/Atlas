import { createDeterministicTextVector } from "./deterministic-vector.js";

export type MemoryEmbeddingProvider = {
  readonly dimensions: number;
  embedText(text: string): Promise<number[]>;
};

export class MemoryEmbeddingError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MemoryEmbeddingError";
  }
}

type OpenAIEmbeddingResponse = {
  readonly data?: ReadonlyArray<{
    readonly embedding?: unknown;
  }>;
};

function readEmbeddingDimensions(): number {
  const rawValue = process.env.MEMORY_EMBEDDING_DIMENSIONS;
  const parsedValue = rawValue ? Number(rawValue) : 1536;

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : 1536;
}

function normalizeVector(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new MemoryEmbeddingError(
      "MEMORY_EMBEDDING_INVALID",
      "Embedding provider returned an invalid vector.",
    );
  }

  return value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new MemoryEmbeddingError(
        "MEMORY_EMBEDDING_INVALID",
        "Embedding provider returned a non-numeric vector.",
      );
    }

    return entry;
  });
}

export class DeterministicMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  public readonly dimensions: number;

  public constructor(dimensions = readEmbeddingDimensions()) {
    this.dimensions = dimensions;
  }

  public embedText(text: string): Promise<number[]> {
    return Promise.resolve(createDeterministicTextVector(text, this.dimensions));
  }
}

export class OpenAIMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  public readonly dimensions: number;

  public constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions = readEmbeddingDimensions(),
    private readonly baseUrl = process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1",
  ) {
    this.dimensions = dimensions;
  }

  public async embedText(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new MemoryEmbeddingError(
        "MEMORY_EMBEDDING_NOT_CONFIGURED",
        "OpenAI embedding provider is not configured.",
      );
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new MemoryEmbeddingError(
        "MEMORY_EMBEDDING_UNAVAILABLE",
        `Embedding provider failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as OpenAIEmbeddingResponse;

    return normalizeVector(payload.data?.[0]?.embedding, this.dimensions);
  }
}

export function createMemoryEmbeddingProvider(): MemoryEmbeddingProvider {
  const provider = process.env.MEMORY_EMBEDDING_PROVIDER ?? "auto";

  if (provider === "deterministic") {
    return new DeterministicMemoryEmbeddingProvider();
  }

  if (provider === "openai" || (provider === "auto" && process.env.OPENAI_API_KEY)) {
    return new OpenAIMemoryEmbeddingProvider();
  }

  return new DeterministicMemoryEmbeddingProvider();
}
