import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;
const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:sk|xoxb|xoxp|xapp)-[A-Za-z0-9-]{12,}\b/g,
  /\b(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi,
];
const SENSITIVE_FIELD_PATTERN =
  /authorization|cookie|set-cookie|token|secret|password|credential|api[_-]?key|private[_-]?key|ciphertext|auth[_-]?tag/i;
const MAX_REDACTION_DEPTH = 8;
const REDACTED_VALUE = "[REDACTED]";

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

export function redactSensitiveText(value: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED_VALUE),
    value,
  );
}

export function isSensitiveFieldName(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(fieldName);
}

export function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_REDACTION_DEPTH) {
    return "[REDACTION_DEPTH_EXCEEDED]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveFieldName(key) ? REDACTED_VALUE : redactSensitiveValue(nestedValue, depth + 1),
    ]),
  );
}

export function redactHttpHeaders(
  headers: Record<string, string | string[] | number | undefined>,
): Record<string, string | string[] | number | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      isSensitiveFieldName(key) ? REDACTED_VALUE : value,
    ]),
  );
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
