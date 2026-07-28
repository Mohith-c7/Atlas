export type WorkflowReadinessStatus = "ready" | "not_connected" | "planned" | "disabled";
export type WorkflowImplementationStatus = "live" | "planned";
export type WorkflowExecutionMode = "automatic" | "approval_required" | "planned_only";

export type FounderWorkflow = {
  id: string;
  title: string;
  description: string;
  triggerExamples: string[];
  provider: string;
  capabilityKeys: string[];
  requiresApproval: boolean;
  executionMode: WorkflowExecutionMode;
  readinessStatus: WorkflowReadinessStatus;
  implementationStatus: WorkflowImplementationStatus;
};

export type ListFounderWorkflowsResponse = {
  workflows: FounderWorkflow[];
  correlationId?: string;
};

export type WorkflowApiErrorResponse = {
  code: string;
  message: string;
  correlationId?: string;
};

export class WorkflowApiError extends Error {
  public readonly code: string;
  public readonly correlationId?: string;
  public readonly statusCode?: number;

  public constructor(input: {
    code: string;
    message: string;
    correlationId?: string;
    statusCode?: number;
  }) {
    super(input.message);
    this.name = "WorkflowApiError";
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.statusCode = input.statusCode;
  }
}
