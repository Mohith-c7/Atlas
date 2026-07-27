export type MemoryKind =
  | "founder_profile"
  | "company_fact"
  | "preference"
  | "decision"
  | "contact"
  | "workflow_pattern"
  | "summary";

export type MemoryItem = {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly source?: string | null;
  readonly confidence?: number | null;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly retainUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ListMemoryItemsResponse = {
  readonly memories: MemoryItem[];
  readonly correlationId: string;
};

export type UpdateMemoryItemRequest = {
  readonly kind?: MemoryKind;
  readonly content?: string;
};

export type UpdateMemoryItemResponse = {
  readonly memory: MemoryItem;
  readonly correlationId: string;
};

export type DeleteMemoryItemResponse = {
  readonly deletedMemoryId: string;
  readonly retainUntil: string;
  readonly correlationId: string;
};

export type ArchiveMemoryItemRequest = {
  readonly archived?: boolean;
};

export type ArchiveMemoryItemResponse = {
  readonly memory: MemoryItem;
  readonly correlationId: string;
};

export type ExportMemoryItemsResponse = {
  readonly memories: MemoryItem[];
  readonly exportedAt: string;
  readonly correlationId: string;
};

export type ImportMemoryItem = {
  readonly kind: MemoryKind;
  readonly content: string;
  readonly source?: string | null;
  readonly confidence?: number | null;
};

export type ImportMemoryItemsRequest = {
  readonly mode?: "append" | "replace";
  readonly memories: ImportMemoryItem[];
};

export type ImportMemoryItemsResponse = {
  readonly memories: MemoryItem[];
  readonly importedCount: number;
  readonly replacedExistingCount: number;
  readonly importedAt: string;
  readonly correlationId: string;
};

export type SearchMemoryRequest = {
  readonly query: string;
  readonly limit?: number;
};

export type MemorySearchMatch = {
  readonly memory: MemoryItem;
  readonly score: number;
  readonly matchReason: string;
};

export type SearchMemoryResponse = {
  readonly matches: MemorySearchMatch[];
  readonly searchedAt: string;
  readonly correlationId: string;
};

export type MergeMemoryItemsRequest = {
  readonly primaryMemoryId: string;
  readonly duplicateMemoryIds: string[];
  readonly content?: string;
  readonly kind?: MemoryKind;
};

export type MergeMemoryItemsResponse = {
  readonly memory: MemoryItem;
  readonly mergedMemoryIds: string[];
  readonly correlationId: string;
};

export type MemoryApiErrorResponse = {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
};

export class MemoryApiError extends Error {
  public readonly code: string;
  public readonly correlationId?: string;
  public readonly statusCode?: number;

  public constructor(input: {
    code: string;
    message: string;
    correlationId?: string;
    statusCode?: number;
  }) {
    super(input.message);
    this.name = "MemoryApiError";
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.statusCode = input.statusCode;
  }
}
