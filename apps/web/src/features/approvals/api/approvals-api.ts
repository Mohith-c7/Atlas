import {
  ApprovalApiError,
  type ApprovalApiErrorResponse,
  type ApprovalDecisionResponse,
  type ApprovalPayload,
  type ApprovalRequest,
  type ApprovalStatus,
  type ListApprovalsResponse,
} from "../types/approval";
import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";

const APPROVALS_ENDPOINT = `${businessApiUrl}/api/v1/approvals`;

const approvalStatuses = new Set<ApprovalStatus>(["pending", "approved", "rejected", "expired"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is ApprovalApiErrorResponse {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === "string" && approvalStatuses.has(value as ApprovalStatus);
}

function normalizePayload(value: unknown): ApprovalPayload | undefined {
  if (
    !isRecord(value) ||
    typeof value.capability !== "string" ||
    typeof value.reason !== "string"
  ) {
    return undefined;
  }

  return {
    capability: value.capability,
    provider: typeof value.provider === "string" ? value.provider : undefined,
    reason: value.reason,
    commandSummary: typeof value.commandSummary === "string" ? value.commandSummary : undefined,
  };
}

function normalizeApproval(value: unknown): ApprovalRequest | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.commandId !== "string" ||
    !isApprovalStatus(value.status) ||
    typeof value.reason !== "string" ||
    typeof value.requestedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    commandId: value.commandId,
    status: value.status,
    reason: value.reason,
    payload: normalizePayload(value.payload),
    requestedAt: value.requestedAt,
    resolvedAt:
      typeof value.resolvedAt === "string" || value.resolvedAt === null
        ? value.resolvedAt
        : undefined,
  };
}

function normalizeApprovalsResponse(payload: unknown): ListApprovalsResponse {
  const approvalItems =
    isRecord(payload) && Array.isArray(payload.approvals) ? payload.approvals : [];

  return {
    approvals: approvalItems
      .map((item) => normalizeApproval(item))
      .filter((item): item is ApprovalRequest => Boolean(item)),
  };
}

function normalizeDecisionResponse(payload: unknown): ApprovalDecisionResponse {
  const approval = isRecord(payload) ? normalizeApproval(payload.approval) : undefined;

  if (!approval) {
    throw new ApprovalApiError({
      code: "INVALID_APPROVAL_RESPONSE",
      message: "Approval response was not valid.",
      statusCode: 502,
    });
  }

  return { approval };
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

async function requestJson<TResponse>(
  url: string,
  init: RequestInit,
  normalize: (payload: unknown) => TResponse,
): Promise<TResponse> {
  const response = await apiFetch(url, {
    ...init,
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new ApprovalApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new ApprovalApiError({
      code: "APPROVAL_REQUEST_FAILED",
      message: "Unable to complete approval request.",
      statusCode: response.status,
    });
  }

  return normalize(payload);
}

export const listApprovals = () =>
  requestJson<ListApprovalsResponse>(
    APPROVALS_ENDPOINT,
    {
      method: "GET",
    },
    normalizeApprovalsResponse,
  );

export const approveRequest = (approvalId: string) =>
  requestJson<ApprovalDecisionResponse>(
    `${APPROVALS_ENDPOINT}/${approvalId}/approve`,
    {
      method: "POST",
    },
    normalizeDecisionResponse,
  );

export const rejectRequest = (approvalId: string) =>
  requestJson<ApprovalDecisionResponse>(
    `${APPROVALS_ENDPOINT}/${approvalId}/reject`,
    {
      method: "POST",
    },
    normalizeDecisionResponse,
  );
