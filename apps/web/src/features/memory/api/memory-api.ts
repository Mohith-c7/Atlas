import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";
import {
  MemoryApiError,
  type DeleteMemoryItemResponse,
  type ExportMemoryItemsResponse,
  type ListMemoryItemsResponse,
  type MemoryApiErrorResponse,
  type MemoryItem,
  type MemoryKind,
  type UpdateMemoryItemRequest,
  type UpdateMemoryItemResponse,
} from "../types/memory";

const MEMORY_ITEMS_ENDPOINT = `${businessApiUrl}/api/v1/memory/items`;
const MEMORY_EXPORT_ENDPOINT = `${businessApiUrl}/api/v1/memory/export`;
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
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
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
    correlationId: typeof payload.correlationId === "string" ? payload.correlationId : "",
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
