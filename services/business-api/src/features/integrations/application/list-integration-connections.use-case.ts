import type { ListIntegrationConnectionsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { resolveDevelopmentFounder } from "../../commands/infrastructure/founder-resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class ListIntegrationConnectionsUseCase {
  private readonly repository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
  }

  public async execute(correlationId: string): Promise<ListIntegrationConnectionsResponse> {
    const founder = await resolveDevelopmentFounder(this.database);
    const connections = await this.repository.listConnections(founder.id);

    return {
      connections,
      correlationId,
    };
  }
}
