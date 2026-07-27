import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

export const encryptedJsonPayloadSchema = z.object({
  algorithm: z.literal(ALGORITHM),
  keyVersion: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});

export type EncryptedJsonPayload = z.infer<typeof encryptedJsonPayloadSchema>;

export type EncryptionKey = {
  readonly version: string;
  readonly material: Buffer;
};

export function parseBase64EncryptionKey(version: string, encodedKey: string): EncryptionKey {
  const material = Buffer.from(encodedKey, "base64");

  if (material.byteLength !== KEY_LENGTH_BYTES) {
    throw new Error("Encryption key must be a 32-byte base64 encoded value.");
  }

  return {
    version,
    material,
  };
}

export function encryptJsonPayload(value: unknown, key: EncryptionKey): EncryptedJsonPayload {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.material, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: ALGORITHM,
    keyVersion: key.version,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJsonPayload(payload: EncryptedJsonPayload, key: EncryptionKey): unknown {
  if (payload.keyVersion !== key.version) {
    throw new Error("Encryption key version does not match payload key version.");
  }

  const parsed = encryptedJsonPayloadSchema.parse(payload);
  const decipher = createDecipheriv(ALGORITHM, key.material, Buffer.from(parsed.iv, "base64"), {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as unknown;
}

export function createEncryptionKeyFromEnvironment(): EncryptionKey {
  const encodedKey = process.env.FAIOS_ENCRYPTION_KEY;
  const keyVersion = process.env.FAIOS_ENCRYPTION_KEY_VERSION ?? "local-v1";

  if (!encodedKey) {
    throw new Error("FAIOS_ENCRYPTION_KEY is required for credential encryption.");
  }

  return parseBase64EncryptionKey(keyVersion, encodedKey);
}
