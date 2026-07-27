import type {
  MemoryContextItem,
  MemoryItem,
  MemoryKind,
  UpdateMemoryItemRequest,
} from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";

type MemoryRecord = Awaited<ReturnType<PrismaClient["memoryItem"]["findMany"]>>[number];

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
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class MemoryRepository {
  public constructor(private readonly database: PrismaClient) {}

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

  public async listRecentMemoryContext(
    founderId: string,
    limit: number,
  ): Promise<MemoryContextItem[]> {
    const memories = await this.database.memoryItem.findMany({
      where: {
        founderId,
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

  public async updateMemoryItem(input: {
    founderId: string;
    memoryId: string;
    patch: UpdateMemoryItemRequest;
  }): Promise<MemoryItem> {
    const existing = await this.database.memoryItem.findFirst({
      where: {
        founderId: input.founderId,
        id: input.memoryId,
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

  public async deleteMemoryItem(input: { founderId: string; memoryId: string }): Promise<string> {
    const existing = await this.database.memoryItem.findFirst({
      where: {
        founderId: input.founderId,
        id: input.memoryId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new AppError("MEMORY_ITEM_NOT_FOUND", "Memory item was not found.", 404);
    }

    await this.database.memoryItem.delete({
      where: {
        id: existing.id,
      },
    });

    return existing.id;
  }
}
