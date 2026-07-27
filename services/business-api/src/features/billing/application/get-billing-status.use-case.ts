import type { GetBillingStatusResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { BillingRepository } from "../infrastructure/billing.repository.js";

export class GetBillingStatusUseCase {
  private readonly repository: BillingRepository;

  public constructor(database: PrismaClient) {
    this.repository = new BillingRepository(database);
  }

  public async execute(
    founderSession: FounderSession,
    correlationId: string,
  ): Promise<GetBillingStatusResponse> {
    return {
      billing: await this.repository.getBillingStatus(founderSession.founderId),
      correlationId,
    };
  }
}
