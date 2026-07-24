export type McpCapabilityStatus = "available" | "not_connected" | "disabled";

export type McpCapability = {
  key: string;
  provider: string;
  label: string;
  description: string;
  requiresApproval: boolean;
  status: McpCapabilityStatus;
};

export type ListMcpCapabilitiesResponse = {
  capabilities: McpCapability[];
  correlationId?: string;
};

export type McpApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
};

export class McpApiError extends Error {
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
    this.name = "McpApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.statusCode = statusCode;
  }
}
