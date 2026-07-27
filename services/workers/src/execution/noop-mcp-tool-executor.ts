import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
  McpToolExecutor,
} from "./mcp-tool-executor.js";

export class NoopMcpToolExecutor implements McpToolExecutor {
  public execute(request: McpToolExecutionRequest): Promise<McpToolExecutionResult> {
    return Promise.resolve({
      status: "failed",
      errorCode: "MCP_EXECUTOR_NOT_CONFIGURED",
      errorMessage: `No MCP executor is configured for capability "${request.capabilityKey}".`,
      retryable: false,
    });
  }
}
