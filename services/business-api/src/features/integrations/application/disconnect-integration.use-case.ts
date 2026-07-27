import type { DisconnectIntegrationResponse, IntegrationProvider } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class DisconnectIntegrationUseCase {
  private readonly repository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly provider: IntegrationProvider;
    readonly reason?: string;
    readonly correlationId: string;
    readonly founderSession?: FounderSession;
  }): Promise<DisconnectIntegrationResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const connection = await this.repository.disconnectConnection({
      founderId: founder.id,
      provider: input.provider,
      reason: input.reason,
    });

    if (!connection) {
      throw new AppError(
        "INTEGRATION_CONNECTION_NOT_FOUND",
        "Integration connection was not found.",
        404,
      );
    }

    return {
      connection,
      correlationId: input.correlationId,
    };
  }
}
