import { browserSessionToken } from "./config";
import { createCorrelationId } from "./correlation-id";

export function createApiHeaders(headers?: HeadersInit): Headers {
  const normalizedHeaders = new Headers(headers);

  normalizedHeaders.set("X-Correlation-Id", createCorrelationId());

  if (browserSessionToken && !normalizedHeaders.has("Authorization")) {
    normalizedHeaders.set("Authorization", `Bearer ${browserSessionToken}`);
  }

  return normalizedHeaders;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: "include",
    headers: createApiHeaders(init.headers),
  });
}
