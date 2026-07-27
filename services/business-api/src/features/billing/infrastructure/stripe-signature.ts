import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header: string): {
  readonly timestamp?: string;
  readonly signatures: readonly string[];
} {
  const parts = header.split(",");
  const signatures: string[] = [];
  let timestamp: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split("=");

    if (key === "t") {
      timestamp = value;
    }

    if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  return {
    timestamp,
    signatures,
  };
}

export function createStripeSignature(input: {
  readonly payload: string;
  readonly secret: string;
  readonly timestamp: number;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.payload}`, "utf8")
    .digest("hex");
}

export function verifyStripeWebhookSignature(input: {
  readonly payload: string;
  readonly signatureHeader: string;
  readonly secret: string;
  readonly now?: Date;
  readonly toleranceSeconds?: number;
}): boolean {
  const parsed = parseSignatureHeader(input.signatureHeader);
  const timestamp = parsed.timestamp ? Number(parsed.timestamp) : Number.NaN;

  if (!Number.isFinite(timestamp) || parsed.signatures.length === 0) {
    return false;
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = createStripeSignature({
    payload: input.payload,
    secret: input.secret,
    timestamp,
  });
  const expectedBuffer = Buffer.from(expected, "hex");

  return parsed.signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");

    return (
      candidate.byteLength === expectedBuffer.byteLength &&
      timingSafeEqual(candidate, expectedBuffer)
    );
  });
}
