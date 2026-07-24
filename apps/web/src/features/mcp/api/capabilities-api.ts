import {
  McpApiError,
  type ListMcpCapabilitiesResponse,
  type McpApiErrorResponse,
  type McpCapability,
  type McpCapabilityStatus,
} from "../types/capability";

const BUSINESS_API_URL =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
const MCP_CAPABILITIES_ENDPOINT = `${BUSINESS_API_URL}/api/v1/mcp/capabilities`;

const capabilityStatuses = new Set<McpCapabilityStatus>(["available", "not_connected", "disabled"]);

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `corr_${crypto.randomUUID()}`;
  }

  return `corr_${Date.now().toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is McpApiErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === "string" && typeof value.message === "string";
}

function isCapabilityStatus(value: unknown): value is McpCapabilityStatus {
  return typeof value === "string" && capabilityStatuses.has(value as McpCapabilityStatus);
}

function normalizeCapability(value: unknown): McpCapability | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const key = typeof value.key === "string" ? value.key : undefined;
  const provider = typeof value.provider === "string" ? value.provider : undefined;
  const label = typeof value.label === "string" ? value.label : undefined;
  const description = typeof value.description === "string" ? value.description : undefined;

  if (!key || !provider || !label || !description || !isCapabilityStatus(value.status)) {
    return undefined;
  }

  return {
    key,
    provider,
    label,
    description,
    requiresApproval: Boolean(value.requiresApproval),
    status: value.status,
  };
}

function normalizeCapabilitiesResponse(payload: unknown): ListMcpCapabilitiesResponse {
  const capabilityItems = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.capabilities)
      ? payload.capabilities
      : [];

  return {
    capabilities: capabilityItems
      .map((item) => normalizeCapability(item))
      .filter((item): item is McpCapability => Boolean(item)),
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string"
        ? payload.correlationId
        : undefined,
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

export async function listMcpCapabilities(): Promise<ListMcpCapabilitiesResponse> {
  const response = await fetch(MCP_CAPABILITIES_ENDPOINT, {
    headers: {
      "X-Correlation-Id": createCorrelationId(),
    },
  });

  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new McpApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new McpApiError({
      code: "MCP_CAPABILITIES_REQUEST_FAILED",
      message: "Unable to load MCP capabilities.",
      statusCode: response.status,
    });
  }

  return normalizeCapabilitiesResponse(payload);
}
