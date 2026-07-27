export type ExecutionStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type CommandExecutionStatus =
  | "received"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type ToolInvocation = {
  id: string;
  commandId: string;
  capabilityKey: string;
  provider?: string | null;
  status: ExecutionStatus;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  maxRetries?: number;
  nextAttemptAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
};

export type CommandExecutionTimelineItem = {
  commandId: string;
  status: CommandExecutionStatus;
  summary?: string | null;
  rawInput: string;
  createdAt: string;
  updatedAt: string;
  invocations: ToolInvocation[];
};

export type ListCommandExecutionsResponse = {
  executions: CommandExecutionTimelineItem[];
};

export type CommandExecutionSnapshotEvent = {
  event: "command.execution.snapshot";
  executions: CommandExecutionTimelineItem[];
  correlationId: string;
  emittedAt: string;
};

export type ExecutionApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
};

export class ExecutionApiError extends Error {
  readonly code: string;
  readonly correlationId?: string;
  readonly statusCode: number;

  constructor({
    code,
    message,
    correlationId,
    statusCode,
  }: {
    code: string;
    message: string;
    correlationId?: string;
    statusCode: number;
  }) {
    super(message);
    this.name = "ExecutionApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.statusCode = statusCode;
  }
}
