export type IntegrationConnectionStatus = "connected" | "disconnected" | "disabled";

export type IntegrationConnection = {
  id: string;
  provider: "github";
  accountLabel?: string | null;
  status: IntegrationConnectionStatus;
  capabilityKeys: string[];
  metadata?: {
    owner?: string;
    repo?: string;
    apiBaseUrl?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type McpCapabilitySummary = {
  key: string;
  provider: string;
  label: string;
  description: string;
  requiresApproval: boolean;
  status: "available" | "not_connected" | "disabled";
};

export type IntegrationCatalogItem = {
  provider: string;
  label: string;
  status: "available" | "coming_soon";
  capabilities: McpCapabilitySummary[];
  connection?: IntegrationConnection | null;
};

export type ListIntegrationCatalogResponse = {
  integrations: IntegrationCatalogItem[];
  correlationId: string;
};

export type ProviderCapabilityReadiness = {
  capabilityKey: string;
  status: "ready" | "not_ready";
  reason?: string;
  checkedAt: string;
};

export type IntegrationProviderStatus = {
  provider: string;
  connected: boolean;
  connection?: IntegrationConnection | null;
  capabilities: ProviderCapabilityReadiness[];
  checkedAt: string;
};

export type GetIntegrationProviderStatusResponse = {
  provider: IntegrationProviderStatus;
  correlationId: string;
};

export type ConnectGitHubIntegrationRequest = {
  accountLabel?: string;
  owner: string;
  repo: string;
  accessToken: string;
  apiBaseUrl?: string;
};

export type StartGitHubOAuthRequest = {
  accountLabel?: string;
  owner: string;
  repo: string;
  redirectUri: string;
  apiBaseUrl?: string;
};

export type StartGitHubOAuthResponse = {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
  correlationId: string;
};

export type ConnectIntegrationResponse = {
  connection: IntegrationConnection;
  correlationId: string;
};

export type ListIntegrationConnectionsResponse = {
  connections: IntegrationConnection[];
  correlationId: string;
};

export type IntegrationApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
};

export class IntegrationApiError extends Error {
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
    this.name = "IntegrationApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.statusCode = statusCode;
  }
}
