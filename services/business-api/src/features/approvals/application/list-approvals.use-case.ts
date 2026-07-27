import type { ListApprovalsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { ApprovalRepository } from "../infrastructure/approval.repository.js";

export class ListApprovalsUseCase {
  private readonly repository: ApprovalRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new ApprovalRepository(database);
  }

  public async execute(founderSession?: FounderSession): Promise<ListApprovalsResponse> {
    const founder = await resolveFounderAccount(this.database, founderSession);

    return {
      approvals: await this.repository.listPendingApprovals(founder.id),
    };
  }
}
