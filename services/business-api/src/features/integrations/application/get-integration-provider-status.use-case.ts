import type {
  GetIntegrationProviderStatusResponse,
  IntegrationProviderStatus,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";
import { createIntegrationReadinessRegistry } from "./list-integration-catalog.use-case.js";

export class GetIntegrationProviderStatusUseCase {
  private readonly connectionRepository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.connectionRepository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly founderSession: FounderSession;
    readonly provider: string;
    readonly correlationId: string;
  }): Promise<GetIntegrationProviderStatusResponse> {
    const [connections, readiness] = await Promise.all([
      this.connectionRepository.listConnections(input.founderSession.founderId),
      createIntegrationReadinessRegistry(this.database).listReadiness(
        input.founderSession.founderId,
      ),
    ]);
    const connection = connections.find((item) => item.provider === input.provider) ?? null;
    const providerReadiness = readiness.filter((item) => item.provider === input.provider);
    const status: IntegrationProviderStatus = {
      provider: input.provider,
      connected: Boolean(connection && connection.status === "connected"),
      connection,
      capabilities: providerReadiness.map((item) => ({
        capabilityKey: item.capabilityKey,
        status: item.status,
        reason: item.status === "not_ready" ? item.reason : undefined,
        checkedAt: item.checkedAt,
      })),
      checkedAt: new Date().toISOString(),
    };

    return {
      provider: status,
      correlationId: input.correlationId,
    };
  }
}
