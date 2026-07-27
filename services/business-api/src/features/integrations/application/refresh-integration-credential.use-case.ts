import type { IntegrationProvider, RefreshIntegrationCredentialResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class RefreshIntegrationCredentialUseCase {
  private readonly connectionRepository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.connectionRepository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly founderSession: FounderSession;
    readonly provider: IntegrationProvider;
    readonly correlationId: string;
  }): Promise<RefreshIntegrationCredentialResponse> {
    const connection = await this.connectionRepository.getConnectionRecordByFounderAndProvider(
      input.founderSession.founderId,
      input.provider,
    );

    if (!connection?.credential) {
      throw new AppError(
        "INTEGRATION_CREDENTIAL_REQUIRED",
        "Integration credentials are required before this provider can be refreshed.",
        409,
      );
    }

    const attemptedAt = new Date();
    const reason =
      input.provider === "github"
        ? "manual_token_rotation_required"
        : "credential_refresh_not_supported";

    await this.connectionRepository.recordCredentialRefreshAttempt({
      founderId: input.founderSession.founderId,
      integrationId: connection.id,
      provider: input.provider,
      attemptedAt,
      result: "not_supported",
      reason,
    });
    const contractConnection = await this.connectionRepository.getConnectionByFounderAndProvider(
      input.founderSession.founderId,
      input.provider,
    );

    return {
      provider: input.provider,
      connection: contractConnection ?? {
        id: connection.id,
        provider: input.provider,
        accountLabel: connection.accountLabel,
        status: "disabled",
        capabilityKeys: connection.capabilityKeys,
        createdAt: connection.createdAt.toISOString(),
        updatedAt: connection.updatedAt.toISOString(),
      },
      refreshed: false,
      reason,
      correlationId: input.correlationId,
    };
  }
}
