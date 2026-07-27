import {
  ExecutionApiError,
  type CommandExecutionStatus,
  type CommandExecutionTimelineItem,
  type ExecutionApiErrorResponse,
  type ExecutionStatus,
  type ListCommandExecutionsResponse,
  type ToolInvocation,
} from "../types/execution";

const BUSINESS_API_URL =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
const EXECUTIONS_ENDPOINT = `${BUSINESS_API_URL}/api/v1/commands/executions`;

const commandStatuses = new Set<CommandExecutionStatus>([
  "received",
  "planning",
  "awaiting_approval",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);

const invocationStatuses = new Set<ExecutionStatus>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `corr_${crypto.randomUUID()}`;
  }

  return `corr_${Date.now().toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is ExecutionApiErrorResponse {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isCommandStatus(value: unknown): value is CommandExecutionStatus {
  return typeof value === "string" && commandStatuses.has(value as CommandExecutionStatus);
}

function isInvocationStatus(value: unknown): value is ExecutionStatus {
  return typeof value === "string" && invocationStatuses.has(value as ExecutionStatus);
}

function normalizeInvocation(value: unknown): ToolInvocation | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.commandId !== "string" ||
    typeof value.capabilityKey !== "string" ||
    !isInvocationStatus(value.status) ||
    typeof value.createdAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    commandId: value.commandId,
    capabilityKey: value.capabilityKey,
    provider:
      typeof value.provider === "string" || value.provider === null ? value.provider : undefined,
    status: value.status,
    requestPayload: value.requestPayload,
    responsePayload: value.responsePayload,
    errorCode:
      typeof value.errorCode === "string" || value.errorCode === null ? value.errorCode : undefined,
    errorMessage:
      typeof value.errorMessage === "string" || value.errorMessage === null
        ? value.errorMessage
        : undefined,
    retryCount: typeof value.retryCount === "number" ? value.retryCount : undefined,
    maxRetries: typeof value.maxRetries === "number" ? value.maxRetries : undefined,
    nextAttemptAt:
      typeof value.nextAttemptAt === "string" || value.nextAttemptAt === null
        ? value.nextAttemptAt
        : undefined,
    startedAt:
      typeof value.startedAt === "string" || value.startedAt === null ? value.startedAt : undefined,
    completedAt:
      typeof value.completedAt === "string" || value.completedAt === null
        ? value.completedAt
        : undefined,
    createdAt: value.createdAt,
  };
}

function normalizeExecution(value: unknown): CommandExecutionTimelineItem | undefined {
  if (
    !isRecord(value) ||
    typeof value.commandId !== "string" ||
    !isCommandStatus(value.status) ||
    typeof value.rawInput !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.invocations)
  ) {
    return undefined;
  }

  return {
    commandId: value.commandId,
    status: value.status,
    summary:
      typeof value.summary === "string" || value.summary === null ? value.summary : undefined,
    rawInput: value.rawInput,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    invocations: value.invocations
      .map((item) => normalizeInvocation(item))
      .filter((item): item is ToolInvocation => Boolean(item)),
  };
}

function normalizeExecutionsResponse(payload: unknown): ListCommandExecutionsResponse {
  const executionItems =
    isRecord(payload) && Array.isArray(payload.executions) ? payload.executions : [];

  return {
    executions: executionItems
      .map((item) => normalizeExecution(item))
      .filter((item): item is CommandExecutionTimelineItem => Boolean(item)),
  };
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

export async function listCommandExecutions(): Promise<ListCommandExecutionsResponse> {
  const response = await fetch(EXECUTIONS_ENDPOINT, {
    headers: {
      "X-Correlation-Id": createCorrelationId(),
    },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new ExecutionApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new ExecutionApiError({
      code: "EXECUTIONS_REQUEST_FAILED",
      message: "Unable to load execution history.",
      statusCode: response.status,
    });
  }

  return normalizeExecutionsResponse(payload);
}
