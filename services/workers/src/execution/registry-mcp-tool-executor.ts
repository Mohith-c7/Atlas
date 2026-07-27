import {
  createDefaultMcpAdapterRegistry,
  isRetryAllowed,
  redactSensitivePayload,
  type McpAdapterRegistry,
} from "@faios/mcp";
import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
  McpToolExecutor,
} from "./mcp-tool-executor.js";

export class RegistryMcpToolExecutor implements McpToolExecutor {
  public constructor(
    private readonly registry: McpAdapterRegistry = createDefaultMcpAdapterRegistry(),
  ) {}

  public async execute(request: McpToolExecutionRequest): Promise<McpToolExecutionResult> {
    const adapter = this.registry.resolve(request.capabilityKey, request.provider);

    if (!adapter) {
      return {
        status: "failed",
        errorCode: "MCP_ADAPTER_NOT_FOUND",
        errorMessage: `No MCP adapter is registered for capability "${request.capabilityKey}".`,
        retryable: false,
      };
    }

    const result = await adapter.execute({
      ...request,
      requestPayload: redactSensitivePayload(request.requestPayload),
    });

    if (result.status === "succeeded") {
      return {
        status: "succeeded",
        responsePayload: redactSensitivePayload(result.responsePayload),
      };
    }

    return {
      status: "failed",
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      retryable: isRetryAllowed(result.retrySafety),
    };
  }
}
