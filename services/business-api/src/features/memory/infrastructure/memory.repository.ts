import type {
  MemorySearchMatch,
  MemoryContextItem,
  MemoryItem,
  MemoryKind,
  MergeMemoryItemsRequest,
  UpdateMemoryItemRequest,
} from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";

type MemoryRecord = Awaited<ReturnType<PrismaClient["memoryItem"]["findMany"]>>[number];
type MemoryDatabase = PrismaClient | Prisma.TransactionClient;

const toPrismaMemoryKind = (kind: MemoryKind) => kind.toUpperCase() as Uppercase<MemoryKind>;
const toContractMemoryKind = (kind: string): MemoryKind => kind.toLowerCase() as MemoryKind;

function toMemoryContextItem(record: MemoryRecord): MemoryContextItem {
  return {
    id: record.id,
    kind: toContractMemoryKind(record.kind),
    content: record.content,
    source: record.source,
    confidence: record.confidence,
    createdAt: record.createdAt.toISOString(),
  };
}

function toMemoryItem(record: MemoryRecord): MemoryItem {
  return {
    ...toMemoryContextItem(record),
    archivedAt: record.archivedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    retainUntil: record.retainUntil?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

const DEFAULT_MEMORY_RETENTION_DAYS = 30;

function getRetainUntil(from: Date): Date {
  return new Date(from.getTime() + DEFAULT_MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function canStartTransaction(database: MemoryDatabase): database is PrismaClient {
  return "$transaction" in database;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length >= 3),
  );
}

function scoreLexicalMatch(query: string, memory: MemoryItem): number {
  const queryTokens = tokenize(query);

  if (queryTokens.size === 0) {
    return 0;
  }

  const memoryTokens = tokenize(`${memory.kind} ${memory.content}`);
  let overlap = 0;

  for (const token of queryTokens) {
    if (memoryTokens.has(token)) {
      overlap += 1;
    }
  }

  const coverage = overlap / queryTokens.size;
  const exactBoost = memory.content.toLowerCase().includes(query.toLowerCase()) ? 0.25 : 0;

  return Math.min(1, coverage + exactBoost);
}

export class MemoryRepository {
  public constructor(private readonly database: MemoryDatabase) {}

  public async createMemoryItem(input: {
    founderId: string;
    kind: MemoryKind;
    content: string;
    source: string;
    confidence: number;
    vectorRef?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<MemoryContextItem> {
    const memory = await this.database.memoryItem.create({
      data: {
        founderId: input.founderId,
        kind: toPrismaMemoryKind(input.kind),
        content: input.content,
        source: input.source,
        confidence: input.confidence,
        vectorRef: input.vectorRef,
        metadata: input.metadata,
      },
    });

    return toMemoryContextItem(memory);
  }

  public async listMemoryItems(founderId: string, limit: number): Promise<MemoryItem[]> {
    const memories = await this.database.memoryItem.findMany({
      where: {
        founderId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: limit,
    });

    return memories.map(toMemoryItem);
  }

  public async createImportedMemoryItems(input: {
    founderId: string;
    memories: ReadonlyArray<{
      kind: MemoryKind;
      content: string;
      source: string | null;
      confidence: number | null;
    }>;
  }): Promise<MemoryItem[]> {
    const createdMemories: MemoryItem[] = [];

    for (const memory of input.memories) {
      const createdMemory = await this.database.memoryItem.create({
        data: {
          founderId: input.founderId,
          kind: toPrismaMemoryKind(memory.kind),
          content: memory.content,
          source: memory.source,
          confidence: memory.confidence,
          metadata: {
            importedAt: new Date().toISOString(),
          },
        },
      });

      createdMemories.push(toMemoryItem(createdMemory));
    }

    return createdMemories;
  }

  public async deleteFounderMemoryItems(founderId: string): Promise<number> {
    const result = await this.database.memoryItem.deleteMany({
      where: {
        founderId,
        archivedAt: null,
        deletedAt: null,
      },
    });

    return result.count;
  }

  public async listRecentMemoryContext(
    founderId: string,
    limit: number,
  ): Promise<MemoryContextItem[]> {
    const memories = await this.database.memoryItem.findMany({
      where: {
        founderId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: limit,
    });

    return memories.map(toMemoryContextItem);
  }

  public async searchMemoryItems(input: {
    founderId: string;
    query: string;
    limit: number;
  }): Promise<MemorySearchMatch[]> {
    const memories = await this.database.memoryItem.findMany({
      where: {
        founderId: input.founderId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: Math.max(input.limit * 5, 50),
    });

    return memories
      .map(toMemoryItem)
      .map((memory) => ({
        memory,
        score: scoreLexicalMatch(input.query, memory),
        matchReason: "Founder-scoped lexical memory match",
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit);
  }

  public async updateMemoryItem(input: {
    founderId: string;
    memoryId: string;
    patch: UpdateMemoryItemRequest;
  }): Promise<MemoryItem> {
    const existing = await this.database.memoryItem.findFirst({
      where: {
        founderId: input.founderId,
        id: input.memoryId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new AppError("MEMORY_ITEM_NOT_FOUND", "Memory item was not found.", 404);
    }

    const memory = await this.database.memoryItem.update({
      where: {
        id: existing.id,
      },
      data: {
        content: input.patch.content,
        kind: input.patch.kind ? toPrismaMemoryKind(input.patch.kind) : undefined,
        source: input.patch.content ? "founder_edit" : undefined,
      },
    });

    return toMemoryItem(memory);
  }

  public async archiveMemoryItem(input: {
    founderId: string;
    memoryId: string;
    archived: boolean;
  }): Promise<MemoryItem> {
    const existing = await this.database.memoryItem.findFirst({
      where: {
        founderId: input.founderId,
        id: input.memoryId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new AppError("MEMORY_ITEM_NOT_FOUND", "Memory item was not found.", 404);
    }

    const memory = await this.database.memoryItem.update({
      where: {
        id: existing.id,
      },
      data: {
        archivedAt: input.archived ? new Date() : null,
      },
    });

    return toMemoryItem(memory);
  }

  public async deleteMemoryItem(input: {
    founderId: string;
    memoryId: string;
  }): Promise<{ deletedMemoryId: string; retainUntil: Date }> {
    const existing = await this.database.memoryItem.findFirst({
      where: {
        founderId: input.founderId,
        id: input.memoryId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new AppError("MEMORY_ITEM_NOT_FOUND", "Memory item was not found.", 404);
    }

    const deletedAt = new Date();
    const retainUntil = getRetainUntil(deletedAt);

    await this.database.memoryItem.update({
      where: {
        id: existing.id,
      },
      data: {
        archivedAt: null,
        deletedAt,
        retainUntil,
      },
    });

    return {
      deletedMemoryId: existing.id,
      retainUntil,
    };
  }

  public async purgeExpiredDeletedMemoryItems(input: {
    founderId: string;
    cutoff: Date;
  }): Promise<string[]> {
    const expiredMemories = await this.database.memoryItem.findMany({
      where: {
        founderId: input.founderId,
        deletedAt: {
          not: null,
        },
        retainUntil: {
          lte: input.cutoff,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        deletedAt: "asc",
      },
    });

    const purgedMemoryIds = expiredMemories.map((memory) => memory.id);

    if (purgedMemoryIds.length === 0) {
      return [];
    }

    await this.database.memoryItem.deleteMany({
      where: {
        founderId: input.founderId,
        id: {
          in: purgedMemoryIds,
        },
      },
    });

    return purgedMemoryIds;
  }

  public async mergeMemoryItems(input: {
    founderId: string;
    request: MergeMemoryItemsRequest;
  }): Promise<{ memory: MemoryItem; mergedMemoryIds: string[] }> {
    const uniqueDuplicateIds = [...new Set(input.request.duplicateMemoryIds)].filter(
      (memoryId) => memoryId !== input.request.primaryMemoryId,
    );

    if (uniqueDuplicateIds.length === 0) {
      throw new AppError(
        "MEMORY_MERGE_DUPLICATES_EMPTY",
        "At least one duplicate memory item is required.",
        400,
      );
    }

    const merge = async (database: MemoryDatabase) =>
      this.mergeMemoryItemsInDatabase({
        database,
        founderId: input.founderId,
        primaryMemoryId: input.request.primaryMemoryId,
        duplicateMemoryIds: uniqueDuplicateIds,
        content: input.request.content,
        kind: input.request.kind,
      });

    const memory = canStartTransaction(this.database)
      ? await this.database.$transaction(async (transaction) => merge(transaction))
      : await merge(this.database);

    return {
      memory: toMemoryItem(memory),
      mergedMemoryIds: uniqueDuplicateIds,
    };
  }

  private async mergeMemoryItemsInDatabase(input: {
    database: MemoryDatabase;
    founderId: string;
    primaryMemoryId: string;
    duplicateMemoryIds: string[];
    content?: string;
    kind?: MemoryKind;
  }): Promise<MemoryRecord> {
    const memories = await input.database.memoryItem.findMany({
      where: {
        founderId: input.founderId,
        archivedAt: null,
        deletedAt: null,
        id: {
          in: [input.primaryMemoryId, ...input.duplicateMemoryIds],
        },
      },
    });

    const primary = memories.find((item) => item.id === input.primaryMemoryId);

    if (!primary) {
      throw new AppError("MEMORY_ITEM_NOT_FOUND", "Primary memory item was not found.", 404);
    }

    if (memories.length !== input.duplicateMemoryIds.length + 1) {
      throw new AppError(
        "MEMORY_DUPLICATE_NOT_FOUND",
        "One or more duplicate memory items were not found.",
        404,
      );
    }

    const duplicateContents = memories
      .filter((item) => item.id !== primary.id)
      .map((item) => item.content);
    const content =
      input.content ??
      [primary.content, ...duplicateContents]
        .map((value) => value.trim())
        .filter(Boolean)
        .join("\n");

    const updated = await input.database.memoryItem.update({
      where: {
        id: primary.id,
      },
      data: {
        content,
        kind: input.kind ? toPrismaMemoryKind(input.kind) : primary.kind,
        source: "founder_merge",
        metadata: {
          mergedMemoryIds: input.duplicateMemoryIds,
          mergedAt: new Date().toISOString(),
        },
      },
    });

    await input.database.memoryItem.deleteMany({
      where: {
        founderId: input.founderId,
        id: {
          in: input.duplicateMemoryIds,
        },
      },
    });

    return updated;
  }
}
