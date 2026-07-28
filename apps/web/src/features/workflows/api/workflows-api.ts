import { apiFetch } from "../../../lib/api-client";
import { businessApiUrl } from "../../../lib/config";
import {
  WorkflowApiError,
  type FounderWorkflow,
  type ListFounderWorkflowsResponse,
  type WorkflowApiErrorResponse,
  type WorkflowExecutionMode,
  type WorkflowImplementationStatus,
  type WorkflowReadinessStatus,
} from "../types/workflow";

const WORKFLOWS_ENDPOINT = `${businessApiUrl}/api/v1/workflows`;

const readinessStatuses = new Set<WorkflowReadinessStatus>([
  "ready",
  "not_connected",
  "planned",
  "disabled",
]);
const implementationStatuses = new Set<WorkflowImplementationStatus>(["live", "planned"]);
const executionModes = new Set<WorkflowExecutionMode>([
  "automatic",
  "approval_required",
  "planned_only",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isApiErrorResponse(value: unknown): value is WorkflowApiErrorResponse {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isWorkflowReadinessStatus(value: unknown): value is WorkflowReadinessStatus {
  return typeof value === "string" && readinessStatuses.has(value as WorkflowReadinessStatus);
}

function isWorkflowImplementationStatus(value: unknown): value is WorkflowImplementationStatus {
  return (
    typeof value === "string" && implementationStatuses.has(value as WorkflowImplementationStatus)
  );
}

function isWorkflowExecutionMode(value: unknown): value is WorkflowExecutionMode {
  return typeof value === "string" && executionModes.has(value as WorkflowExecutionMode);
}

function normalizeWorkflow(value: unknown): FounderWorkflow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const readinessStatus = isWorkflowReadinessStatus(value.readinessStatus)
    ? value.readinessStatus
    : undefined;
  const implementationStatus = isWorkflowImplementationStatus(value.implementationStatus)
    ? value.implementationStatus
    : undefined;
  const executionMode = isWorkflowExecutionMode(value.executionMode)
    ? value.executionMode
    : undefined;

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.provider !== "string" ||
    !Array.isArray(value.triggerExamples) ||
    !Array.isArray(value.capabilityKeys) ||
    !readinessStatus ||
    !implementationStatus ||
    !executionMode
  ) {
    return undefined;
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    provider: value.provider,
    triggerExamples: value.triggerExamples.filter(
      (item): item is string => typeof item === "string",
    ),
    capabilityKeys: value.capabilityKeys.filter((item): item is string => typeof item === "string"),
    requiresApproval: Boolean(value.requiresApproval),
    executionMode,
    readinessStatus,
    implementationStatus,
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

export async function listFounderWorkflows(): Promise<ListFounderWorkflowsResponse> {
  const response = await apiFetch(WORKFLOWS_ENDPOINT);
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new WorkflowApiError({
        code: payload.code,
        message: payload.message,
        correlationId: payload.correlationId,
        statusCode: response.status,
      });
    }

    throw new WorkflowApiError({
      code: "WORKFLOW_CATALOG_REQUEST_FAILED",
      message: "Unable to load founder workflows.",
      statusCode: response.status,
    });
  }

  const workflows =
    isRecord(payload) && Array.isArray(payload.workflows)
      ? payload.workflows
          .map((item) => normalizeWorkflow(item))
          .filter((item): item is FounderWorkflow => Boolean(item))
      : [];

  return {
    workflows,
    correlationId:
      isRecord(payload) && typeof payload.correlationId === "string"
        ? payload.correlationId
        : undefined,
  };
}
