import type { ApprovalDecisionResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import { resolveDevelopmentFounder } from "../../commands/infrastructure/founder-resolver.js";
import { ApprovalRepository } from "../infrastructure/approval.repository.js";

type ApprovalDecision = "APPROVED" | "REJECTED";

export class DecideApprovalUseCase {
  private readonly repository: ApprovalRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new ApprovalRepository(database);
  }

  public async execute(
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalDecisionResponse> {
    const founder = await resolveDevelopmentFounder(this.database);
    const approval = await this.repository.decideApproval(founder.id, approvalId, decision);

    if (!approval) {
      throw new AppError("APPROVAL_NOT_FOUND", "Approval request was not found.", 404);
    }

    return { approval };
  }
}
