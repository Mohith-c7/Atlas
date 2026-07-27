import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";
import {
  BillingApiError,
  type BillingApiErrorResponse,
  type BillingStatusResponse,
  type CreateBillingCheckoutSessionRequest,
  type CreateBillingCheckoutSessionResponse,
  type CreateBillingPortalSessionRequest,
  type CreateBillingPortalSessionResponse,
} from "../types/billing";

const BILLING_STATUS_ENDPOINT = `${businessApiUrl}/api/v1/billing/status`;
const BILLING_CHECKOUT_SESSIONS_ENDPOINT = `${businessApiUrl}/api/v1/billing/checkout/sessions`;
const BILLING_PORTAL_SESSIONS_ENDPOINT = `${businessApiUrl}/api/v1/billing/portal/sessions`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is BillingApiErrorResponse {
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

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const response = await apiFetch(BILLING_STATUS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new BillingApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new BillingApiError({
      code: "BILLING_REQUEST_FAILED",
      message: "Unable to load billing status.",
      statusCode: response.status,
    });
  }

  return payload as BillingStatusResponse;
}

export async function createBillingCheckoutSession(
  request: CreateBillingCheckoutSessionRequest,
): Promise<CreateBillingCheckoutSessionResponse> {
  const response = await apiFetch(BILLING_CHECKOUT_SESSIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new BillingApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new BillingApiError({
      code: "BILLING_CHECKOUT_REQUEST_FAILED",
      message: "Unable to start checkout.",
      statusCode: response.status,
    });
  }

  return payload as CreateBillingCheckoutSessionResponse;
}

export async function createBillingPortalSession(
  request: CreateBillingPortalSessionRequest,
): Promise<CreateBillingPortalSessionResponse> {
  const response = await apiFetch(BILLING_PORTAL_SESSIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new BillingApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new BillingApiError({
      code: "BILLING_PORTAL_REQUEST_FAILED",
      message: "Unable to open billing portal.",
      statusCode: response.status,
    });
  }

  return payload as CreateBillingPortalSessionResponse;
}
