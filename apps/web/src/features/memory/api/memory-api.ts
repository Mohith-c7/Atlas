import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";
import {
  MemoryApiError,
  type ArchiveMemoryItemRequest,
  type ArchiveMemoryItemResponse,
  type DeleteMemoryItemResponse,
  type ExportMemoryItemsResponse,
  type ImportMemoryItem,
  type ImportMemoryItemsRequest,
  type ImportMemoryItemsResponse,
  type ListMemoryItemsResponse,
  type MergeMemoryItemsRequest,
  type MergeMemoryItemsResponse,
  type MemoryApiErrorResponse,
  type MemoryItem,
  type MemoryKind,
  type MemorySearchMatch,
  type SearchMemoryRequest,
  type SearchMemoryResponse,
  type UpdateMemoryItemRequest,
  type UpdateMemoryItemResponse,
} from "../types/memory";

const MEMORY_ITEMS_ENDPOINT = `${businessApiUrl}/api/v1/memory/items`;
const MEMORY_EXPORT_ENDPOINT = `${businessApiUrl}/api/v1/memory/export`;
const MEMORY_IMPORT_ENDPOINT = `${businessApiUrl}/api/v1/memory/import`;
const MEMORY_SEARCH_ENDPOINT = `${businessApiUrl}/api/v1/memory/search`;
const MEMORY_MERGE_ENDPOINT = `${businessApiUrl}/api/v1/memory/merge`;
const memoryKinds = new Set<MemoryKind>([
  "founder_profile",
  "company_fact",
  "preference",
  "decision",
  "contact",
  "workflow_pattern",
  "summary",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && memoryKinds.has(value as MemoryKind);
}

function isApiErrorResponse(value: unknown): value is MemoryApiErrorResponse {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function throwMemoryError(payload: unknown, statusCode: number, fallbackMessage: string): never {
  if (isApiErrorResponse(payload)) {
    throw new MemoryApiError({
      code: payload.code,
      message: payload.message,
      correlationId: payload.correlationId,
      statusCode,
    });
  }

  throw new MemoryApiError({
    code: "MEMORY_REQUEST_FAILED",
    message: fallbackMessage,
    statusCode,
  });
}

function normalizeMemoryItem(value: unknown): MemoryItem | undefined {
  if (!isRecord(value) || !isMemoryKind(value.kind)) {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.content !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    kind: value.kind,
    content: value.content,
    source: typeof value.source === "string" ? value.source : null,
    confidence: typeof value.confidence === "number" ? value.confidence : null,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : null,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
    retainUntil: typeof value.retainUntil === "string" ? value.retainUntil : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeMemorySearchMatch(value: unknown): MemorySearchMatch | undefined {
  if (
    !isRecord(value) ||
    typeof value.score !== "number" ||
    typeof value.matchReason !== "string"
  ) {
    return undefined;
  }

  const memory = normalizeMemoryItem(value.memory);

  if (!memory) {
    return undefined;
  }

  return {
    memory,
    score: Math.max(0, Math.min(1, value.score)),
    matchReason: value.matchReason,
  };
}

function normalizeImportMemoryItem(value: unknown): ImportMemoryItem | undefined {
  if (!isRecord(value) || !isMemoryKind(value.kind) || typeof value.content !== "string") {
    return undefined;
  }

  return {
    kind: value.kind,
    content: value.content,
    source: typeof value.source === "string" ? value.source : null,
    confidence: typeof value.confidence === "number" ? value.confidence : null,
  };
}

export function normalizeMemoryImportPayload(value: unknown): ImportMemoryItemsRequest | undefined {
  const candidateMemories = isRecord(value) && Array.isArray(value.memories) ? value.memories : [];
  const memories = candidateMemories
    .map((item) => normalizeImportMemoryItem(item))
    .filter((item): item is ImportMemoryItem => Boolean(item));

  if (memories.length === 0) {
    return undefined;
  }

  return {
    mode: "append",
    memories,
  };
}

export async function listMemoryItems(): Promise<ListMemoryItemsResponse> {
  const response = await apiFetch(MEMORY_ITEMS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to load memory items.");
  }

  const memories =
    isRecord(payload) && Array.isArray(payload.memories)
      ? payload.memories
          .map((item) => normalizeMemoryItem(item))
          .filter((item): item is MemoryItem => Boolean(item))
      : [];

  return {
    memories,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function updateMemoryItem(input: {
  memoryId: string;
  patch: UpdateMemoryItemRequest;
}): Promise<UpdateMemoryItemResponse> {
  const response = await apiFetch(
    `${MEMORY_ITEMS_ENDPOINT}/${encodeURIComponent(input.memoryId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.patch),
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to update memory item.");
  }

  const memory = isRecord(payload) ? normalizeMemoryItem(payload.memory) : undefined;

  if (!memory) {
    throw new MemoryApiError({
      code: "MEMORY_RESPONSE_INVALID",
      message: "Memory update response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    memory,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function deleteMemoryItem(memoryId: string): Promise<DeleteMemoryItemResponse> {
  const response = await apiFetch(`${MEMORY_ITEMS_ENDPOINT}/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to delete memory item.");
  }

  if (!isRecord(payload) || typeof payload.deletedMemoryId !== "string") {
    throw new MemoryApiError({
      code: "MEMORY_RESPONSE_INVALID",
      message: "Memory delete response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    deletedMemoryId: payload.deletedMemoryId,
    retainUntil: typeof payload.retainUntil === "string" ? payload.retainUntil : "",
    correlationId: typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function archiveMemoryItem(input: {
  memoryId: string;
  request?: ArchiveMemoryItemRequest;
}): Promise<ArchiveMemoryItemResponse> {
  const response = await apiFetch(
    `${MEMORY_ITEMS_ENDPOINT}/${encodeURIComponent(input.memoryId)}/archive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.request ?? { archived: true }),
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to archive memory item.");
  }

  const memory = isRecord(payload) ? normalizeMemoryItem(payload.memory) : undefined;

  if (!memory) {
    throw new MemoryApiError({
      code: "MEMORY_RESPONSE_INVALID",
      message: "Memory archive response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    memory,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function exportMemoryItems(): Promise<ExportMemoryItemsResponse> {
  const response = await apiFetch(MEMORY_EXPORT_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to export memory items.");
  }

  const memories =
    isRecord(payload) && Array.isArray(payload.memories)
      ? payload.memories
          .map((item) => normalizeMemoryItem(item))
          .filter((item): item is MemoryItem => Boolean(item))
      : [];

  return {
    memories,
    exportedAt:
      isRecord(payload) && typeof payload.exportedAt === "string" ? payload.exportedAt : "",
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function importMemoryItems(
  request: ImportMemoryItemsRequest,
): Promise<ImportMemoryItemsResponse> {
  const response = await apiFetch(MEMORY_IMPORT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to import memory items.");
  }

  const memories =
    isRecord(payload) && Array.isArray(payload.memories)
      ? payload.memories
          .map((item) => normalizeMemoryItem(item))
          .filter((item): item is MemoryItem => Boolean(item))
      : [];

  return {
    memories,
    importedCount:
      isRecord(payload) && typeof payload.importedCount === "number" ? payload.importedCount : 0,
    replacedExistingCount:
      isRecord(payload) && typeof payload.replacedExistingCount === "number"
        ? payload.replacedExistingCount
        : 0,
    importedAt:
      isRecord(payload) && typeof payload.importedAt === "string" ? payload.importedAt : "",
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function searchMemoryItems(input: SearchMemoryRequest): Promise<SearchMemoryResponse> {
  const response = await apiFetch(MEMORY_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to search memory items.");
  }

  const matches =
    isRecord(payload) && Array.isArray(payload.matches)
      ? payload.matches
          .map((item) => normalizeMemorySearchMatch(item))
          .filter((item): item is MemorySearchMatch => Boolean(item))
      : [];

  return {
    matches,
    searchedAt:
      isRecord(payload) && typeof payload.searchedAt === "string" ? payload.searchedAt : "",
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function mergeMemoryItems(
  input: MergeMemoryItemsRequest,
): Promise<MergeMemoryItemsResponse> {
  const response = await apiFetch(MEMORY_MERGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwMemoryError(payload, response.status, "Unable to merge memory items.");
  }

  const memory = isRecord(payload) ? normalizeMemoryItem(payload.memory) : undefined;

  if (!memory || !isRecord(payload) || !Array.isArray(payload.mergedMemoryIds)) {
    throw new MemoryApiError({
      code: "MEMORY_RESPONSE_INVALID",
      message: "Memory merge response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    memory,
    mergedMemoryIds: payload.mergedMemoryIds.filter(
      (memoryId): memoryId is string => typeof memoryId === "string",
    ),
    correlationId: typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}
