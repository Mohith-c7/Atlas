import type { ApprovalDecisionResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { createLogger } from "@faios/logger";
import { AppError } from "../../../lib/errors.js";
import { resolveDevelopmentFounder } from "../../commands/infrastructure/founder-resolver.js";
import { createExecutionDispatcher } from "../infrastructure/execution-dispatcher.js";
import { ApprovalRepository } from "../infrastructure/approval.repository.js";

type ApprovalDecision = "APPROVED" | "REJECTED";

export class DecideApprovalUseCase {
  private readonly repository: ApprovalRepository;
  private readonly executionDispatcher = createExecutionDispatcher();
  private readonly logger = createLogger("business-api.approvals");

  public constructor(private readonly database: PrismaClient) {
    this.repository = new ApprovalRepository(database);
  }

  public async execute(
    approvalId: string,
    decision: ApprovalDecision,
    correlationId: string,
  ): Promise<ApprovalDecisionResponse> {
    const founder = await resolveDevelopmentFounder(this.database);
    const result = await this.repository.decideApproval(founder.id, approvalId, decision);

    if (!result) {
      throw new AppError("APPROVAL_NOT_FOUND", "Approval request was not found.", 404);
    }

    try {
      await this.executionDispatcher.dispatch(result.executionJobs, correlationId);
    } catch (error) {
      this.logger.error(
        {
          approvalId,
          commandId: result.approval.commandId,
          correlationId,
          error,
        },
        "Failed to dispatch execution jobs to RabbitMQ",
      );
    }

    return { approval: result.approval };
  }
}
