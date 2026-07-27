import type { ExecutionJob } from "@faios/contracts";

export type McpToolExecutionRequest = ExecutionJob;

export type McpToolExecutionResult =
  | {
      readonly status: "succeeded";
      readonly responsePayload?: unknown;
    }
  | {
      readonly status: "failed";
      readonly errorCode: string;
      readonly errorMessage: string;
      readonly retryable: boolean;
    };

export interface McpToolExecutor {
  execute(request: McpToolExecutionRequest): Promise<McpToolExecutionResult>;
}
