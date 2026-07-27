import type { PrismaClient } from "@faios/database";
import {
  createEncryptionKeyFromEnvironment,
  decryptJsonPayload,
  encryptedJsonPayloadSchema,
  type EncryptionKey,
} from "@faios/security";
import type {
  McpCredentialUnavailableReason,
  McpCredentialResolutionRequest,
  McpCredentialResolver,
  McpResolvedCredentials,
} from "@faios/mcp";

const activeIntegrationStatuses = new Set(["active", "available", "connected"]);
const unhealthyIntegrationStatuses = new Set(["degraded", "down", "error", "failed", "unhealthy"]);

type StoredIntegrationConnection = NonNullable<
  Awaited<ReturnType<DatabaseMcpCredentialResolver["findLatestConnection"]>>
>;
type StoredIntegrationConnectionWithCredential = StoredIntegrationConnection & {
  readonly credential: NonNullable<StoredIntegrationConnection["credential"]>;
};

export class DatabaseMcpCredentialResolver implements McpCredentialResolver {
  private readonly encryptionKey: EncryptionKey;

  public constructor(
    private readonly database: PrismaClient,
    encryptionKey: EncryptionKey = createEncryptionKeyFromEnvironment(),
  ) {
    this.encryptionKey = encryptionKey;
  }

  public async resolveCredentials(
    request: McpCredentialResolutionRequest,
  ): Promise<McpResolvedCredentials | undefined> {
    const connection = await this.findLatestConnection(request);

    if (!this.hasCredential(connection)) {
      return undefined;
    }

    if (this.connectionUnavailableReason(connection)) {
      return undefined;
    }

    const credentialPayload = this.decryptCredentialPayload(connection);

    if (this.isExpiredCredentialPayload(credentialPayload)) {
      return undefined;
    }

    return {
      integrationId: connection.id,
      provider: connection.provider,
      accountLabel: connection.accountLabel,
      capabilityKeys: connection.capabilityKeys,
      metadata: connection.metadata ?? undefined,
      credentialPayload,
    };
  }

  public async getCredentialUnavailableReason(
    request: McpCredentialResolutionRequest,
  ): Promise<McpCredentialUnavailableReason | undefined> {
    const connection = await this.findLatestConnection(request);

    if (!connection) {
      return {
        errorCode: "MCP_CREDENTIALS_NOT_FOUND",
        errorMessage: `${request.provider} credentials are not connected for this founder.`,
        retrySafety: "never_retry",
      };
    }

    if (!this.hasCredential(connection)) {
      return {
        errorCode: "MCP_CREDENTIALS_NOT_FOUND",
        errorMessage: `${connection.provider} credentials are missing for this founder.`,
        retrySafety: "never_retry",
      };
    }

    const unavailableReason = this.connectionUnavailableReason(connection);

    if (unavailableReason) {
      return unavailableReason;
    }

    const credentialPayload = this.decryptCredentialPayload(connection);

    if (this.isExpiredCredentialPayload(credentialPayload)) {
      return {
        errorCode: "MCP_CREDENTIALS_EXPIRED",
        errorMessage: `${connection.provider} credentials have expired and must be reconnected.`,
        retrySafety: "never_retry",
      };
    }

    return undefined;
  }

  private async findLatestConnection(request: McpCredentialResolutionRequest) {
    return this.database.integrationConnection.findFirst({
      where: {
        founderId: request.founderId,
        provider: request.provider,
        capabilityKeys: {
          has: request.capabilityKey,
        },
      },
      include: {
        credential: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  private hasCredential(
    connection: StoredIntegrationConnection | null,
  ): connection is StoredIntegrationConnectionWithCredential {
    return Boolean(connection?.credential);
  }

  private connectionUnavailableReason(
    connection: StoredIntegrationConnection,
  ): McpCredentialUnavailableReason | undefined {
    if (!activeIntegrationStatuses.has(connection.status.toLowerCase())) {
      return {
        errorCode: "MCP_INTEGRATION_DISCONNECTED",
        errorMessage:
          connection.statusReason ??
          `${connection.provider} integration is ${connection.status.toLowerCase()}.`,
        retrySafety: "never_retry",
      };
    }

    if (
      connection.lastHealthStatus &&
      unhealthyIntegrationStatuses.has(connection.lastHealthStatus.toLowerCase())
    ) {
      return {
        errorCode: "MCP_PROVIDER_HEALTH_FAILED",
        errorMessage:
          connection.lastHealthMessage ??
          `${connection.provider} provider health is ${connection.lastHealthStatus.toLowerCase()}.`,
        retrySafety: "retry_transient",
      };
    }

    return undefined;
  }

  private decryptCredentialPayload(connection: StoredIntegrationConnectionWithCredential): unknown {
    const encryptedPayload = encryptedJsonPayloadSchema.parse(
      connection.credential.encryptedPayload,
    );

    return decryptJsonPayload(encryptedPayload, this.encryptionKey);
  }

  private isExpiredCredentialPayload(credentialPayload: unknown): boolean {
    if (!credentialPayload || typeof credentialPayload !== "object") {
      return false;
    }

    const expiresAt = (credentialPayload as { readonly expiresAt?: unknown }).expiresAt;

    if (typeof expiresAt !== "string") {
      return false;
    }

    const expiresAtMs = Date.parse(expiresAt);

    return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
  }
}
