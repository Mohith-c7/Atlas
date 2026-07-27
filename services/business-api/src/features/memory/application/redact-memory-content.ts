import { redactSensitiveText } from "@faios/security";

export function redactMemoryContent(value: string): string {
  return redactSensitiveText(value).replace(
    /\b(token|secret|api key|api-key)\s+(?:is\s+|as\s+|called\s+|named\s+|using\s+)?\S+/giu,
    "$1 [REDACTED]",
  );
}
