import type {
  GitHubIntegrationConnectionRequest,
  IntegrationConnection as IntegrationConnectionContract,
  IntegrationConnectionStatus,
  IntegrationPermissionSummary,
  IntegrationProvider,
} from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";
import { CredentialVaultRepository } from "./credential-vault.repository.js";

const githubCapabilityKeys = ["repository.createIssue"] as const;

type IntegrationConnectionRecord = Awaited<
  ReturnType<PrismaClient["integrationConnection"]["findMany"]>
>[number];

type LifecycleEventType =
  | "connected"
  | "disconnected"
  | "reconnected"
  | "credential_rotated"
  | "health_checked"
  | "permission_checked"
  | "credential_refresh_attempted"
  | "credential_refreshed"
  | "credential_refresh_failed"
  | "execution_denied_expired_credential";

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
    statusReason: connection.statusReason,
    capabilityKeys: connection.capabilityKeys,
    metadata: normalizeMetadata(connection.metadata),
    connectedAt: connection.connectedAt?.toISOString(),
    disconnectedAt: connection.disconnectedAt?.toISOString(),
    lastHealthStatus: connection.lastHealthStatus,
    lastHealthCheckedAt: connection.lastHealthCheckedAt?.toISOString(),
    lastHealthMessage: connection.lastHealthMessage,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function toPermissionSummaryContract(summary: {
  readonly provider: string;
  readonly scopes: string[];
  readonly permissions: Prisma.JsonValue | null;
  readonly checkedAt: Date;
}): IntegrationPermissionSummary {
  return {
    provider: summary.provider,
    scopes: summary.scopes,
    permissions:
      summary.permissions &&
      typeof summary.permissions === "object" &&
      !Array.isArray(summary.permissions)
        ? summary.permissions
        : null,
    checkedAt: summary.checkedAt.toISOString(),
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
    options: {
      readonly eventType?: LifecycleEventType;
      readonly reason?: string;
      readonly rotatedAt?: Date;
    } = {},
  ): Promise<IntegrationConnectionContract> {
    const metadata = {
      owner: request.owner,
      repo: request.repo,
      apiBaseUrl: request.apiBaseUrl,
    };
    const accountLabel = request.accountLabel ?? `${request.owner}/${request.repo}`;
    const connectedAt = new Date();

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
        statusReason: null,
        capabilityKeys: [...githubCapabilityKeys],
        metadata,
        connectedAt,
        disconnectedAt: null,
      },
      update: {
        accountLabel,
        status: "connected",
        statusReason: null,
        capabilityKeys: [...githubCapabilityKeys],
        metadata,
        connectedAt,
        disconnectedAt: null,
      },
    });

    await new CredentialVaultRepository(this.database).upsertIntegrationCredential(
      connection.id,
      {
        accessToken: request.accessToken,
        owner: request.owner,
        repo: request.repo,
        apiBaseUrl: request.apiBaseUrl,
      },
      {
        rotatedAt: options.rotatedAt,
        rotationReason: options.reason,
      },
    );

    await this.recordLifecycleEvent({
      founderId,
      integrationId: connection.id,
      provider: "github",
      eventType: options.eventType ?? "connected",
      reason: options.reason,
      metadata,
    });

    return toContractConnection(connection);
  }

  public async getConnectionByFounderAndProvider(
    founderId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationConnectionContract | undefined> {
    const connection = await this.database.integrationConnection.findUnique({
      where: {
        founderId_provider: {
          founderId,
          provider,
        },
      },
    });

    return connection ? toContractConnection(connection) : undefined;
  }

  public async getConnectionRecordByFounderAndProvider(
    founderId: string,
    provider: IntegrationProvider,
  ) {
    return this.database.integrationConnection.findUnique({
      where: {
        founderId_provider: {
          founderId,
          provider,
        },
      },
      include: {
        credential: true,
        permissionSummary: true,
      },
    });
  }

  public async getPermissionSummary(
    founderId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationPermissionSummary | undefined> {
    const summary = await this.database.integrationPermissionSummary.findFirst({
      where: {
        founderId,
        provider,
      },
      orderBy: {
        checkedAt: "desc",
      },
    });

    return summary ? toPermissionSummaryContract(summary) : undefined;
  }

  public async updateConnectionHealth(input: {
    readonly founderId: string;
    readonly provider: IntegrationProvider;
    readonly status: "ready" | "not_ready";
    readonly message?: string;
    readonly checkedAt: Date;
  }): Promise<IntegrationConnectionContract | undefined> {
    const connection = await this.database.integrationConnection.findUnique({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
    });

    if (!connection) {
      return undefined;
    }

    const updatedConnection = await this.database.integrationConnection.update({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
      data: {
        lastHealthStatus: input.status,
        lastHealthCheckedAt: input.checkedAt,
        lastHealthMessage: input.message,
      },
    });

    await this.recordLifecycleEvent({
      founderId: input.founderId,
      integrationId: updatedConnection.id,
      provider: input.provider,
      eventType: "health_checked",
      reason: input.message,
      metadata: {
        status: input.status,
      },
    });

    return toContractConnection(updatedConnection);
  }

  public async upsertPermissionSummary(input: {
    readonly founderId: string;
    readonly integrationId: string;
    readonly provider: IntegrationProvider;
    readonly scopes: readonly string[];
    readonly permissions: Prisma.InputJsonValue;
    readonly checkedAt: Date;
  }): Promise<IntegrationPermissionSummary> {
    const summary = await this.database.integrationPermissionSummary.upsert({
      where: {
        integrationId: input.integrationId,
      },
      create: {
        founderId: input.founderId,
        integrationId: input.integrationId,
        provider: input.provider,
        scopes: [...input.scopes],
        permissions: input.permissions,
        checkedAt: input.checkedAt,
      },
      update: {
        scopes: [...input.scopes],
        permissions: input.permissions,
        checkedAt: input.checkedAt,
      },
    });

    await this.recordLifecycleEvent({
      founderId: input.founderId,
      integrationId: input.integrationId,
      provider: input.provider,
      eventType: "permission_checked",
      metadata: {
        scopes: [...input.scopes],
      },
    });

    return toPermissionSummaryContract(summary);
  }

  public async recordCredentialRefreshAttempt(input: {
    readonly founderId: string;
    readonly integrationId: string;
    readonly provider: IntegrationProvider;
    readonly attemptedAt: Date;
    readonly result: "not_supported" | "refreshed" | "failed";
    readonly reason?: string;
  }): Promise<void> {
    await this.database.integrationCredential.update({
      where: {
        integrationId: input.integrationId,
      },
      data: {
        lastRefreshAttemptAt: input.attemptedAt,
        lastRefreshedAt: input.result === "refreshed" ? input.attemptedAt : undefined,
        refreshFailureReason: input.result === "refreshed" ? null : input.reason,
      },
    });

    await this.recordLifecycleEvent({
      founderId: input.founderId,
      integrationId: input.integrationId,
      provider: input.provider,
      eventType:
        input.result === "refreshed"
          ? "credential_refreshed"
          : input.result === "failed"
            ? "credential_refresh_failed"
            : "credential_refresh_attempted",
      reason: input.reason,
      metadata: {
        result: input.result,
      },
    });
  }

  public async disconnectConnection(input: {
    readonly founderId: string;
    readonly provider: IntegrationProvider;
    readonly reason?: string;
  }): Promise<IntegrationConnectionContract | undefined> {
    const existing = await this.database.integrationConnection.findUnique({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
    });

    if (!existing) {
      return undefined;
    }

    const disconnectedAt = new Date();
    const connection = await this.database.integrationConnection.update({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
      data: {
        status: "disconnected",
        statusReason: input.reason,
        disconnectedAt,
      },
    });

    await this.recordLifecycleEvent({
      founderId: input.founderId,
      integrationId: connection.id,
      provider: input.provider,
      eventType: "disconnected",
      reason: input.reason,
    });

    return toContractConnection(connection);
  }

  public async reconnectConnection(input: {
    readonly founderId: string;
    readonly provider: IntegrationProvider;
  }): Promise<IntegrationConnectionContract | undefined> {
    const existing = await this.database.integrationConnection.findUnique({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
      include: {
        credential: true,
      },
    });

    if (!existing || !existing.credential) {
      return undefined;
    }

    const connectedAt = new Date();
    const connection = await this.database.integrationConnection.update({
      where: {
        founderId_provider: {
          founderId: input.founderId,
          provider: input.provider,
        },
      },
      data: {
        status: "connected",
        statusReason: null,
        connectedAt,
        disconnectedAt: null,
      },
    });

    await this.recordLifecycleEvent({
      founderId: input.founderId,
      integrationId: connection.id,
      provider: input.provider,
      eventType: "reconnected",
    });

    return toContractConnection(connection);
  }

  public async rotateGitHubCredential(input: {
    readonly founderId: string;
    readonly request: GitHubIntegrationConnectionRequest;
    readonly reason?: string;
  }): Promise<{
    readonly connection: IntegrationConnectionContract;
    readonly rotatedAt: Date;
  }> {
    const rotatedAt = new Date();
    const connection = await this.upsertGitHubConnection(input.founderId, input.request, {
      eventType: "credential_rotated",
      reason: input.reason,
      rotatedAt,
    });

    return {
      connection,
      rotatedAt,
    };
  }

  private async recordLifecycleEvent(input: {
    readonly founderId: string;
    readonly integrationId: string;
    readonly provider: string;
    readonly eventType: LifecycleEventType;
    readonly reason?: string;
    readonly metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.database.integrationLifecycleEvent.create({
      data: {
        founderId: input.founderId,
        integrationId: input.integrationId,
        provider: input.provider,
        eventType: input.eventType,
        reason: input.reason,
        metadata: input.metadata,
      },
    });
  }

  public async createOAuthState(input: {
    founderId: string;
    provider: "github";
    state: string;
    redirectUri: string;
    metadata: Prisma.InputJsonValue;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.integrationOAuthState.create({
      data: input,
    });
  }

  public async consumeOAuthState(input: {
    founderId: string;
    provider: "github";
    state: string;
    now: Date;
  }): Promise<
    | {
        readonly redirectUri: string;
        readonly metadata: Prisma.JsonValue;
      }
    | undefined
  > {
    const oauthState = await this.database.$transaction(async (transaction) => {
      const consumeResult = await transaction.integrationOAuthState.updateMany({
        where: {
          founderId: input.founderId,
          provider: input.provider,
          state: input.state,
          consumedAt: null,
          expiresAt: {
            gt: input.now,
          },
        },
        data: {
          consumedAt: input.now,
        },
      });

      if (consumeResult.count !== 1) {
        return undefined;
      }

      return transaction.integrationOAuthState.findUnique({
        where: {
          state: input.state,
        },
      });
    });

    if (!oauthState) {
      return undefined;
    }

    return {
      redirectUri: oauthState.redirectUri,
      metadata: oauthState.metadata,
    };
  }
}
