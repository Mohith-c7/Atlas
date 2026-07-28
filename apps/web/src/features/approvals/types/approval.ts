export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalPayload = {
  capability: string;
  provider?: string;
  reason: string;
  commandSummary?: string;
  executionPayload?: unknown;
};

export type ApprovalRequest = {
  id: string;
  commandId: string;
  status: ApprovalStatus;
  reason: string;
  payload?: ApprovalPayload;
  requestedAt: string;
  resolvedAt?: string | null;
};

export type ListApprovalsResponse = {
  approvals: ApprovalRequest[];
};

export type ApprovalDecisionResponse = {
  approval: ApprovalRequest;
};

export type ApprovalApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
};

export class ApprovalApiError extends Error {
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
    this.name = "ApprovalApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.statusCode = statusCode;
  }
}
