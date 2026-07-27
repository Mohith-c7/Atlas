import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";
import {
  AccountApiError,
  type AccountApiErrorResponse,
  type GetFounderAccountResponse,
  type ListFounderSessionsResponse,
  type RevokeFounderSessionResponse,
  type UpdateFounderAccountRequest,
} from "../types/account";

const ACCOUNT_ENDPOINT = `${businessApiUrl}/api/v1/account`;
const AUTH_SESSIONS_ENDPOINT = `${businessApiUrl}/api/v1/auth/sessions`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is AccountApiErrorResponse {
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

function throwAccountError(payload: unknown, statusCode: number, fallbackMessage: string): never {
  if (isApiErrorResponse(payload)) {
    throw new AccountApiError({
      code: payload.code,
      message: payload.message,
      correlationId: payload.correlationId,
      statusCode,
    });
  }

  throw new AccountApiError({
    code: "ACCOUNT_REQUEST_FAILED",
    message: fallbackMessage,
    statusCode,
  });
}

export async function getFounderAccount(): Promise<GetFounderAccountResponse> {
  const response = await apiFetch(ACCOUNT_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throwAccountError(payload, response.status, "Unable to load founder account.");
  }

  return payload as GetFounderAccountResponse;
}

export async function updateFounderAccount(
  request: UpdateFounderAccountRequest,
): Promise<GetFounderAccountResponse> {
  const response = await apiFetch(ACCOUNT_ENDPOINT, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwAccountError(payload, response.status, "Unable to update founder account.");
  }

  return payload as GetFounderAccountResponse;
}

export async function listFounderSessions(): Promise<ListFounderSessionsResponse> {
  const response = await apiFetch(AUTH_SESSIONS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throwAccountError(payload, response.status, "Unable to load founder sessions.");
  }

  return payload as ListFounderSessionsResponse;
}

export async function revokeFounderSession(
  sessionId: string,
): Promise<RevokeFounderSessionResponse> {
  const response = await apiFetch(`${AUTH_SESSIONS_ENDPOINT}/${sessionId}`, {
    method: "DELETE",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwAccountError(payload, response.status, "Unable to revoke founder session.");
  }

  return payload as RevokeFounderSessionResponse;
}
