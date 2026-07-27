import type { PrismaClient } from "@faios/database";
import type {
  McpCredentialResolutionRequest,
  McpCredentialResolver,
  McpResolvedCredentials,
} from "@faios/mcp";
import {
  createEncryptionKeyFromEnvironment,
  decryptJsonPayload,
  encryptedJsonPayloadSchema,
  type EncryptionKey,
} from "@faios/security";

const activeIntegrationStatuses = new Set(["active", "available", "connected"]);

export class DatabaseMcpCredentialResolver implements McpCredentialResolver {
  public constructor(
    private readonly database: PrismaClient,
    private readonly encryptionKey?: EncryptionKey,
  ) {}

  public async resolveCredentials(
    request: McpCredentialResolutionRequest,
  ): Promise<McpResolvedCredentials | undefined> {
    const connection = await this.database.integrationConnection.findFirst({
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

    if (!connection?.credential) {
      return undefined;
    }

    if (!activeIntegrationStatuses.has(connection.status.toLowerCase())) {
      return undefined;
    }

    const encryptedPayload = encryptedJsonPayloadSchema.parse(
      connection.credential.encryptedPayload,
    );

    return {
      integrationId: connection.id,
      provider: connection.provider,
      accountLabel: connection.accountLabel,
      capabilityKeys: connection.capabilityKeys,
      metadata: connection.metadata ?? undefined,
      credentialPayload: decryptJsonPayload(
        encryptedPayload,
        this.encryptionKey ?? createEncryptionKeyFromEnvironment(),
      ),
    };
  }
}
