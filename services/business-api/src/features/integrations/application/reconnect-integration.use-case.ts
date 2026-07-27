import type { IntegrationProvider, ReconnectIntegrationResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class ReconnectIntegrationUseCase {
  private readonly repository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly provider: IntegrationProvider;
    readonly correlationId: string;
    readonly founderSession?: FounderSession;
  }): Promise<ReconnectIntegrationResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const connection = await this.repository.reconnectConnection({
      founderId: founder.id,
      provider: input.provider,
    });

    if (!connection) {
      throw new AppError(
        "INTEGRATION_CREDENTIAL_REQUIRED",
        "Integration credentials are required before this provider can be reconnected.",
        409,
      );
    }

    return {
      connection,
      correlationId: input.correlationId,
    };
  }
}
