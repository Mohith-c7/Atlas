import type { MemoryKind } from "@faios/contracts";
import { redactSensitiveText } from "@faios/security";

export type MemoryCandidate = {
  readonly kind: MemoryKind;
  readonly content: string;
  readonly source: string;
  readonly confidence: number;
};

const MEMORY_PATTERNS: ReadonlyArray<{
  readonly kind: MemoryKind;
  readonly confidence: number;
  readonly pattern: RegExp;
  readonly prefix: string;
}> = [
  {
    kind: "company_fact",
    confidence: 0.86,
    pattern: /\b(?:remember that\s+)?(?:our|my)\s+company\s+is\s+(.+)/i,
    prefix: "Company is",
  },
  {
    kind: "company_fact",
    confidence: 0.8,
    pattern: /\b(?:we are|we're)\s+building\s+(.+)/i,
    prefix: "Company is building",
  },
  {
    kind: "preference",
    confidence: 0.78,
    pattern: /\b(?:remember that\s+)?(?:i|we)\s+prefer\s+(.+)/i,
    prefix: "Founder prefers",
  },
  {
    kind: "decision",
    confidence: 0.82,
    pattern: /\b(?:remember that\s+)?(?:we|i)\s+decided\s+to\s+(.+)/i,
    prefix: "Decision",
  },
];

function normalizeMemoryFragment(value: string): string {
  return redactSensitiveText(value)
    .trim()
    .replace(/[.?!]+$/u, "");
}

export function extractMemoryCandidates(commandInput: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];

  for (const definition of MEMORY_PATTERNS) {
    const match = definition.pattern.exec(commandInput);
    const fragment = match?.[1] ? normalizeMemoryFragment(match[1]) : "";

    if (fragment.length < 3 || fragment.includes("[REDACTED]")) {
      continue;
    }

    candidates.push({
      kind: definition.kind,
      content: `${definition.prefix}: ${fragment}`,
      source: "command",
      confidence: definition.confidence,
    });
  }

  return candidates.slice(0, 3);
}
