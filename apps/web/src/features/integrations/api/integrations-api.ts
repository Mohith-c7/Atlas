import {
  IntegrationApiError,
  type ConnectGitHubIntegrationRequest,
  type ConnectIntegrationResponse,
  type GetIntegrationProviderStatusResponse,
  type IntegrationApiErrorResponse,
  type IntegrationCatalogItem,
  type IntegrationConnection,
  type IntegrationConnectionStatus,
  type ListIntegrationConnectionsResponse,
  type ListIntegrationCatalogResponse,
  type RotateGitHubCredentialRequest,
  type RotateIntegrationCredentialResponse,
  type StartGitHubOAuthRequest,
  type StartGitHubOAuthResponse,
  type TestIntegrationConnectionResponse,
} from "../types/integration";
import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";

const INTEGRATION_CONNECTIONS_ENDPOINT = `${businessApiUrl}/api/v1/integrations/connections`;
const INTEGRATION_CATALOG_ENDPOINT = `${businessApiUrl}/api/v1/integrations/catalog`;
const INTEGRATION_PROVIDERS_ENDPOINT = `${businessApiUrl}/api/v1/integrations/providers`;
const GITHUB_CONNECTIONS_ENDPOINT = `${businessApiUrl}/api/v1/integrations/github/connections`;
const GITHUB_CREDENTIAL_ROTATION_ENDPOINT = `${businessApiUrl}/api/v1/integrations/github/credentials/rotate`;
const GITHUB_OAUTH_START_ENDPOINT = `${businessApiUrl}/api/v1/integrations/github/oauth/start`;
const connectionStatuses = new Set<IntegrationConnectionStatus>([
  "connected",
  "disconnected",
  "disabled",
]);

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
    statusReason: typeof value.statusReason === "string" ? value.statusReason : null,
    capabilityKeys: value.capabilityKeys.filter((item): item is string => typeof item === "string"),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    connectedAt: typeof value.connectedAt === "string" ? value.connectedAt : null,
    disconnectedAt: typeof value.disconnectedAt === "string" ? value.disconnectedAt : null,
    lastHealthStatus: typeof value.lastHealthStatus === "string" ? value.lastHealthStatus : null,
    lastHealthCheckedAt:
      typeof value.lastHealthCheckedAt === "string" ? value.lastHealthCheckedAt : null,
    lastHealthMessage: typeof value.lastHealthMessage === "string" ? value.lastHealthMessage : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeCatalogItem(value: unknown): IntegrationCatalogItem | undefined {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.label !== "string") {
    return undefined;
  }

  if (value.status !== "available" && value.status !== "coming_soon") {
    return undefined;
  }

  return {
    provider: value.provider,
    label: value.label,
    status: value.status,
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter(
          (capability): capability is IntegrationCatalogItem["capabilities"][number] =>
            isRecord(capability) &&
            typeof capability.key === "string" &&
            typeof capability.provider === "string" &&
            typeof capability.label === "string" &&
            typeof capability.description === "string" &&
            typeof capability.requiresApproval === "boolean" &&
            typeof capability.status === "string",
        )
      : [],
    connection: normalizeConnection(value.connection),
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
  const response = await apiFetch(INTEGRATION_CONNECTIONS_ENDPOINT);

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

export async function listIntegrationCatalog(): Promise<ListIntegrationCatalogResponse> {
  const response = await apiFetch(INTEGRATION_CATALOG_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to load integration catalog.");
  }

  const integrations =
    isRecord(payload) && Array.isArray(payload.integrations)
      ? payload.integrations
          .map((item) => normalizeCatalogItem(item))
          .filter((item): item is IntegrationCatalogItem => Boolean(item))
      : [];

  return {
    integrations,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function getIntegrationProviderStatus(
  provider: string,
): Promise<GetIntegrationProviderStatusResponse> {
  const response = await apiFetch(
    `${INTEGRATION_PROVIDERS_ENDPOINT}/${encodeURIComponent(provider)}/status`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to load provider status.");
  }

  return payload as GetIntegrationProviderStatusResponse;
}

export async function testIntegrationConnection(
  provider: string,
): Promise<TestIntegrationConnectionResponse> {
  const response = await apiFetch(
    `${businessApiUrl}/api/v1/integrations/${encodeURIComponent(provider)}/health-check`,
    {
      method: "POST",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to test integration connection.");
  }

  return payload as TestIntegrationConnectionResponse;
}

export async function connectGitHubIntegration(
  request: ConnectGitHubIntegrationRequest,
): Promise<ConnectIntegrationResponse> {
  const response = await apiFetch(GITHUB_CONNECTIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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

export async function disconnectIntegration(
  provider: string,
  reason?: string,
): Promise<ConnectIntegrationResponse> {
  const response = await apiFetch(
    `${businessApiUrl}/api/v1/integrations/${encodeURIComponent(provider)}/disconnect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to disconnect integration.");
  }

  const connection = isRecord(payload) ? normalizeConnection(payload.connection) : undefined;

  if (!connection) {
    throw new IntegrationApiError({
      code: "INTEGRATION_RESPONSE_INVALID",
      message: "Integration disconnect response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    connection,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function reconnectIntegration(provider: string): Promise<ConnectIntegrationResponse> {
  const response = await apiFetch(
    `${businessApiUrl}/api/v1/integrations/${encodeURIComponent(provider)}/reconnect`,
    {
      method: "POST",
    },
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to reconnect integration.");
  }

  const connection = isRecord(payload) ? normalizeConnection(payload.connection) : undefined;

  if (!connection) {
    throw new IntegrationApiError({
      code: "INTEGRATION_RESPONSE_INVALID",
      message: "Integration reconnect response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    connection,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function rotateGitHubCredential(
  request: RotateGitHubCredentialRequest,
): Promise<RotateIntegrationCredentialResponse> {
  const response = await apiFetch(GITHUB_CREDENTIAL_ROTATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throwIntegrationError(payload, response.status, "Unable to rotate GitHub credential.");
  }

  const connection = isRecord(payload) ? normalizeConnection(payload.connection) : undefined;

  if (!connection || !isRecord(payload) || typeof payload.rotatedAt !== "string") {
    throw new IntegrationApiError({
      code: "INTEGRATION_RESPONSE_INVALID",
      message: "Credential rotation response was invalid.",
      statusCode: response.status,
    });
  }

  return {
    connection,
    rotatedAt: payload.rotatedAt,
    correlationId: typeof payload.correlationId === "string" ? payload.correlationId : "",
  };
}

export async function startGitHubOAuth(
  request: StartGitHubOAuthRequest,
): Promise<StartGitHubOAuthResponse> {
  const response = await apiFetch(GITHUB_OAUTH_START_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
