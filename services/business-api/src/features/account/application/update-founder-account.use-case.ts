import type { GetFounderAccountResponse, UpdateFounderAccountRequest } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { FounderAccountRepository } from "../infrastructure/founder-account.repository.js";

export class UpdateFounderAccountUseCase {
  private readonly repository: FounderAccountRepository;

  public constructor(database: PrismaClient) {
    this.repository = new FounderAccountRepository(database);
  }

  public async execute(
    founderSession: FounderSession,
    input: UpdateFounderAccountRequest,
    correlationId: string,
  ): Promise<GetFounderAccountResponse> {
    const account = await this.repository.update(founderSession.founderId, input);

    return {
      account,
      correlationId,
    };
  }
}
