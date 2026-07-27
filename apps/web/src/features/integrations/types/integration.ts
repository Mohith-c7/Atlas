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

export type ConnectGitHubIntegrationRequest = {
  accountLabel?: string;
  owner: string;
  repo: string;
  accessToken: string;
  apiBaseUrl?: string;
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
