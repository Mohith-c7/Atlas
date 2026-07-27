import type { GetFounderAccountResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { FounderAccountRepository } from "../infrastructure/founder-account.repository.js";

export class GetFounderAccountUseCase {
  private readonly repository: FounderAccountRepository;

  public constructor(database: PrismaClient) {
    this.repository = new FounderAccountRepository(database);
  }

  public async execute(
    founderSession: FounderSession,
    correlationId: string,
  ): Promise<GetFounderAccountResponse> {
    const account = await this.repository.getById(founderSession.founderId);

    if (!account) {
      throw new AppError("FOUNDER_NOT_FOUND", "Founder account was not found.", 404);
    }

    return {
      account,
      correlationId,
    };
  }
}
