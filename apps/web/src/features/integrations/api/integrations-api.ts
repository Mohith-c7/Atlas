import {
  IntegrationApiError,
  type ConnectGitHubIntegrationRequest,
  type ConnectIntegrationResponse,
  type IntegrationApiErrorResponse,
  type IntegrationConnection,
  type IntegrationConnectionStatus,
  type ListIntegrationConnectionsResponse,
  type StartGitHubOAuthRequest,
  type StartGitHubOAuthResponse,
} from "../types/integration";

const BUSINESS_API_URL =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
const INTEGRATION_CONNECTIONS_ENDPOINT = `${BUSINESS_API_URL}/api/v1/integrations/connections`;
const GITHUB_CONNECTIONS_ENDPOINT = `${BUSINESS_API_URL}/api/v1/integrations/github/connections`;
const GITHUB_OAUTH_START_ENDPOINT = `${BUSINESS_API_URL}/api/v1/integrations/github/oauth/start`;
const connectionStatuses = new Set<IntegrationConnectionStatus>([
  "connected",
  "disconnected",
  "disabled",
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

function isApiErrorResponse(value: unknown): value is IntegrationApiErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === "string" && typeof value.message === "string";
}

function isConnectionStatus(value: unknown): value is IntegrationConnectionStatus {
  return typeof value === "string" && connectionStatuses.has(value as IntegrationConnectionStatus);
}

function normalizeConnection(value: unknown): IntegrationConnection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    value.provider !== "github" ||
    !isConnectionStatus(value.status) ||
    !Array.isArray(value.capabilityKeys) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    provider: "github",
    accountLabel: typeof value.accountLabel === "string" ? value.accountLabel : null,
    status: value.status,
    capabilityKeys: value.capabilityKeys.filter((item): item is string => typeof item === "string"),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
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

function throwIntegrationError(
  payload: unknown,
  statusCode: number,
  fallbackMessage: string,
): never {
  if (isApiErrorResponse(payload)) {
    throw new IntegrationApiError({
      code: payload.code,
      message: payload.message,
      correlationId: payload.correlationId,
      statusCode,
    });
  }

  throw new IntegrationApiError({
    code: "INTEGRATION_REQUEST_FAILED",
    message: fallbackMessage,
    statusCode,
  });
}

export async function listIntegrationConnections(): Promise<ListIntegrationConnectionsResponse> {
  const response = await fetch(INTEGRATION_CONNECTIONS_ENDPOINT, {
    headers: {
      "X-Correlation-Id": createCorrelationId(),
    },
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to load integration connections.");
  }

  const connections =
    isRecord(payload) && Array.isArray(payload.connections)
      ? payload.connections
          .map((item) => normalizeConnection(item))
          .filter((item): item is IntegrationConnection => Boolean(item))
      : [];

  return {
    connections,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function connectGitHubIntegration(
  request: ConnectGitHubIntegrationRequest,
): Promise<ConnectIntegrationResponse> {
  const response = await fetch(GITHUB_CONNECTIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": createCorrelationId(),
    },
    body: JSON.stringify(request),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to connect GitHub.");
  }

  const connection = isRecord(payload) ? normalizeConnection(payload.connection) : undefined;

  if (!connection) {
    throw new IntegrationApiError({
      code: "INTEGRATION_RESPONSE_INVALID",
      message: "Integration connection response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    connection,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function startGitHubOAuth(
  request: StartGitHubOAuthRequest,
): Promise<StartGitHubOAuthResponse> {
  const response = await fetch(GITHUB_OAUTH_START_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": createCorrelationId(),
    },
    body: JSON.stringify(request),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to start GitHub OAuth.");
  }

  if (
    !isRecord(payload) ||
    typeof payload.authorizationUrl !== "string" ||
    typeof payload.state !== "string" ||
    typeof payload.expiresAt !== "string" ||
    typeof payload.correlationId !== "string"
  ) {
    throw new IntegrationApiError({
      code: "GITHUB_OAUTH_RESPONSE_INVALID",
      message: "GitHub OAuth response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    authorizationUrl: payload.authorizationUrl,
    state: payload.state,
    expiresAt: payload.expiresAt,
    correlationId: payload.correlationId,
  };
}
