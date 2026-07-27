import type {
  IntegrationProvider,
  IntegrationProviderStatus,
  TestIntegrationConnectionResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { createIntegrationReadinessRegistry } from "./list-integration-catalog.use-case.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class TestIntegrationConnectionUseCase {
  private readonly connectionRepository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.connectionRepository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly founderSession: FounderSession;
    readonly provider: IntegrationProvider;
    readonly correlationId: string;
  }): Promise<TestIntegrationConnectionResponse> {
    const connection = await this.connectionRepository.getConnectionByFounderAndProvider(
      input.founderSession.founderId,
      input.provider,
    );

    if (!connection) {
      throw new AppError(
        "INTEGRATION_CONNECTION_NOT_FOUND",
        "Integration connection was not found.",
        404,
      );
    }

    const checkedAt = new Date();
    const readiness = await createIntegrationReadinessRegistry(this.database).listReadiness(
      input.founderSession.founderId,
    );
    const providerReadiness = readiness.filter((item) => item.provider === input.provider);
    const failedReadiness = providerReadiness.find((item) => item.status === "not_ready");
    const healthStatus = failedReadiness ? "not_ready" : "ready";
    const healthMessage = failedReadiness?.reason ?? "Provider credentials are ready.";
    const updatedConnection =
      (await this.connectionRepository.updateConnectionHealth({
        founderId: input.founderSession.founderId,
        provider: input.provider,
        status: healthStatus,
        message: healthMessage,
        checkedAt,
      })) ?? connection;
    const permissionSummary =
      healthStatus === "ready"
        ? await this.connectionRepository.upsertPermissionSummary({
            founderId: input.founderSession.founderId,
            integrationId: connection.id,
            provider: input.provider,
            scopes: connection.capabilityKeys,
            permissions: {
              capabilities: connection.capabilityKeys.map((capabilityKey) => ({
                capabilityKey,
                allowed: true,
              })),
            },
            checkedAt,
          })
        : ((await this.connectionRepository.getPermissionSummary(
            input.founderSession.founderId,
            input.provider,
          )) ?? null);
    const status: IntegrationProviderStatus = {
      provider: input.provider,
      connected: updatedConnection.status === "connected" && healthStatus === "ready",
      connection: updatedConnection,
      capabilities: providerReadiness.map((item) => ({
        capabilityKey: item.capabilityKey,
        status: item.status,
        reason: item.status === "not_ready" ? item.reason : undefined,
        checkedAt: item.checkedAt,
      })),
      permissionSummary,
      checkedAt: checkedAt.toISOString(),
    };

    return {
      provider: status,
      correlationId: input.correlationId,
    };
  }
}
