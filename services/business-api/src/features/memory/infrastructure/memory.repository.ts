import type { MemoryContextItem, MemoryKind } from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";

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
}
