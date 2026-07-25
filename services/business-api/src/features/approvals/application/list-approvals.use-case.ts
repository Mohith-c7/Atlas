import type { ListApprovalsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { resolveDevelopmentFounder } from "../../commands/infrastructure/founder-resolver.js";
import { ApprovalRepository } from "../infrastructure/approval.repository.js";

export class ListApprovalsUseCase {
  private readonly repository: ApprovalRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new ApprovalRepository(database);
  }

  public async execute(): Promise<ListApprovalsResponse> {
    const founder = await resolveDevelopmentFounder(this.database);

    return {
      approvals: await this.repository.listPendingApprovals(founder.id),
    };
  }
}
