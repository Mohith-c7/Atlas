import {
  planCommandResponseSchema,
  type PlanCommandRequest,
  type PlanCommandResponse,
} from "@faios/contracts";
import { AppError } from "../../../lib/errors.js";

export class AiOrchestratorClient {
  public constructor(
    private readonly baseUrl = process.env.AI_ORCHESTRATOR_URL ?? "http://localhost:8000",
    private readonly timeoutMs = Number(process.env.AI_ORCHESTRATOR_TIMEOUT_MS ?? "15000"),
  ) {}

  public async planCommand(request: PlanCommandRequest): Promise<PlanCommandResponse> {
    let response: Response;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      response = await fetch(`${this.baseUrl}/internal/v1/commands/plan`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": request.correlationId,
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
    } catch (error) {
      throw new AppError("AI_ORCHESTRATOR_UNAVAILABLE", "AI Orchestrator is unavailable.", 503, {
        cause: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new AppError(
        "COMMAND_PLANNING_FAILED",
        "Unable to create a plan for this command.",
        502,
        {
          status: response.status,
        },
      );
    }

    const payload: unknown = await response.json();
    const parsed = planCommandResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new AppError(
        "COMMAND_PLANNING_FAILED",
        "AI Orchestrator returned an invalid plan.",
        502,
        {
          issues: parsed.error.flatten(),
        },
      );
    }

    return parsed.data;
  }
}
