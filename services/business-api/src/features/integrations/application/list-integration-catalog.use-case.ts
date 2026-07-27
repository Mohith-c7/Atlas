import type {
  IntegrationCatalogItem,
  ListIntegrationCatalogResponse,
  McpCapability,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { createDefaultMcpAdapterRegistry } from "@faios/mcp";
import type { FounderSession } from "../../../lib/founder-session.js";
import { CapabilityRegistry } from "../../mcp-capabilities/infrastructure/capability-registry.js";
import { DatabaseMcpCredentialResolver } from "../infrastructure/database-mcp-credential.resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

const providerLabels: Record<string, string> = {
  github: "GitHub",
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  jira: "Jira",
  notion: "Notion",
};

function groupCapabilitiesByProvider(capabilities: readonly McpCapability[]) {
  return capabilities.reduce<Record<string, McpCapability[]>>((groups, capability) => {
    groups[capability.provider] = [...(groups[capability.provider] ?? []), capability];
    return groups;
  }, {});
}

export class ListIntegrationCatalogUseCase {
  private readonly connectionRepository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.connectionRepository = new IntegrationConnectionRepository(database);
  }

  public async execute(
    founderSession: FounderSession,
    correlationId: string,
  ): Promise<ListIntegrationCatalogResponse> {
    const capabilities = new CapabilityRegistry().listAvailableCapabilities();
    const connections = await this.connectionRepository.listConnections(founderSession.founderId);
    const capabilitiesByProvider = groupCapabilitiesByProvider(capabilities);

    const integrations = Object.entries(capabilitiesByProvider).map(
      ([provider, providerCapabilities]): IntegrationCatalogItem => ({
        provider,
        label: providerLabels[provider] ?? provider,
        status: provider === "github" ? "available" : "coming_soon",
        capabilities: providerCapabilities,
        connection: connections.find((connection) => connection.provider === provider) ?? null,
      }),
    );

    return {
      integrations,
      correlationId,
    };
  }
}

export function createIntegrationReadinessRegistry(database: PrismaClient) {
  return createDefaultMcpAdapterRegistry({
    credentialResolver: new DatabaseMcpCredentialResolver(database),
    includeRealProviderAdapters: true,
  });
}
