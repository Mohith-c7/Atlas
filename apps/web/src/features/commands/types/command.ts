export type CommandSource = "chat" | "voice";

export type CommandStatus = "completed" | "awaiting_approval" | "failed";

export type CreateCommandRequest = {
  input: string;
  conversationId?: string;
  source: CommandSource;
};

export type CommandPlanStep = {
  capability: string;
  provider?: string;
  requiresApproval: boolean;
  reason: string;
};

export type CreateCommandResponse = {
  commandId: string;
  conversationId: string;
  status: CommandStatus;
  summary: string;
  steps: CommandPlanStep[];
  correlationId: string;
};

export type ApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
};

export class CommandApiError extends Error {
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
    this.name = "CommandApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.statusCode = statusCode;
  }
}
