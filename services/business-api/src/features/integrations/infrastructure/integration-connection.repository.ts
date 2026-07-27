import type {
  GitHubIntegrationConnectionRequest,
  IntegrationConnection as IntegrationConnectionContract,
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";
import { CredentialVaultRepository } from "./credential-vault.repository.js";

const githubCapabilityKeys = ["repository.createIssue"] as const;

type IntegrationConnectionRecord = Awaited<
  ReturnType<PrismaClient["integrationConnection"]["findMany"]>
>[number];

function isIntegrationProvider(value: string): value is IntegrationProvider {
  return value === "github";
}

function isConnectionStatus(value: string): value is IntegrationConnectionStatus {
  return value === "connected" || value === "disconnected" || value === "disabled";
}

function normalizeMetadata(value: Prisma.JsonValue): IntegrationConnectionContract["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const metadata = value as Record<string, unknown>;

  return {
    ...metadata,
    owner: typeof metadata.owner === "string" ? metadata.owner : undefined,
    repo: typeof metadata.repo === "string" ? metadata.repo : undefined,
    apiBaseUrl: typeof metadata.apiBaseUrl === "string" ? metadata.apiBaseUrl : undefined,
  };
}

function toContractConnection(
  connection: IntegrationConnectionRecord,
): IntegrationConnectionContract {
  if (!isIntegrationProvider(connection.provider)) {
    throw new Error(`Unsupported integration provider "${connection.provider}".`);
  }

  return {
    id: connection.id,
    provider: connection.provider,
    accountLabel: connection.accountLabel,
    status: isConnectionStatus(connection.status) ? connection.status : "disabled",
    capabilityKeys: connection.capabilityKeys,
    metadata: normalizeMetadata(connection.metadata),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export class IntegrationConnectionRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async listConnections(founderId: string): Promise<IntegrationConnectionContract[]> {
    const connections = await this.database.integrationConnection.findMany({
      where: {
        founderId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return connections
      .filter((connection) => isIntegrationProvider(connection.provider))
      .map(toContractConnection);
  }

  public async upsertGitHubConnection(
    founderId: string,
    request: GitHubIntegrationConnectionRequest,
  ): Promise<IntegrationConnectionContract> {
    const metadata = {
      owner: request.owner,
      repo: request.repo,
      apiBaseUrl: request.apiBaseUrl,
    };
    const accountLabel = request.accountLabel ?? `${request.owner}/${request.repo}`;

    const connection = await this.database.integrationConnection.upsert({
      where: {
        founderId_provider: {
          founderId,
          provider: "github",
        },
      },
      create: {
        founderId,
        provider: "github",
        accountLabel,
        status: "connected",
        capabilityKeys: [...githubCapabilityKeys],
        metadata,
      },
      update: {
        accountLabel,
        status: "connected",
        capabilityKeys: [...githubCapabilityKeys],
        metadata,
      },
    });

    await new CredentialVaultRepository(this.database).upsertIntegrationCredential(connection.id, {
      accessToken: request.accessToken,
      owner: request.owner,
      repo: request.repo,
      apiBaseUrl: request.apiBaseUrl,
    });

    return toContractConnection(connection);
  }
}
