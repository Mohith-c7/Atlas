import type { PrismaClient } from "@faios/database";
import {
  createEncryptionKeyFromEnvironment,
  decryptJsonPayload,
  encryptJsonPayload,
  encryptedJsonPayloadSchema,
  type EncryptionKey,
} from "@faios/security";

export class CredentialVaultRepository {
  private readonly encryptionKey: EncryptionKey;

  public constructor(
    private readonly database: PrismaClient,
    encryptionKey: EncryptionKey = createEncryptionKeyFromEnvironment(),
  ) {
    this.encryptionKey = encryptionKey;
  }

  public async upsertIntegrationCredential(
    integrationId: string,
    credentialPayload: unknown,
    options: {
      readonly rotatedAt?: Date;
      readonly rotationReason?: string;
    } = {},
  ): Promise<void> {
    const encryptedPayload = encryptJsonPayload(credentialPayload, this.encryptionKey);

    await this.database.integrationCredential.upsert({
      where: {
        integrationId,
      },
      create: {
        integrationId,
        encryptedPayload,
        keyVersion: encryptedPayload.keyVersion,
        rotatedAt: options.rotatedAt,
        rotationReason: options.rotationReason,
      },
      update: {
        encryptedPayload,
        keyVersion: encryptedPayload.keyVersion,
        rotatedAt: options.rotatedAt,
        rotationReason: options.rotationReason,
      },
    });
  }

  public async readIntegrationCredential(integrationId: string): Promise<unknown> {
    const credential = await this.database.integrationCredential.findUnique({
      where: {
        integrationId,
      },
    });

    if (!credential) {
      return undefined;
    }

    const encryptedPayload = encryptedJsonPayloadSchema.parse(credential.encryptedPayload);

    return decryptJsonPayload(encryptedPayload, this.encryptionKey);
  }
}
