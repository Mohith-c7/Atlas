import { z } from "zod";

const sensitiveKeyPattern =
  /authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|cookie|credential|private[_-]?key/i;

export const REDACTED_VALUE = "[REDACTED]";

export function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitivePayload(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sensitiveKeyPattern.test(key) ? REDACTED_VALUE : redactSensitivePayload(nestedValue),
    ]),
  );
}

export const mcpAdapterRetrySafetySchema = z.enum([
  "never_retry",
  "retry_if_idempotent",
  "retry_transient",
]);

export const mcpAdapterRequestSchema = z.object({
  invocationId: z.string(),
  commandId: z.string(),
  founderId: z.string(),
  capabilityKey: z.string(),
  provider: z.string().nullable().optional(),
  requestPayload: z.unknown().optional(),
});

export type McpAdapterRetrySafety = z.infer<typeof mcpAdapterRetrySafetySchema>;
export type McpAdapterRequest = z.infer<typeof mcpAdapterRequestSchema>;

export type McpAdapterExecutionResult =
  | {
      readonly status: "succeeded";
      readonly responsePayload?: unknown;
    }
  | {
      readonly status: "failed";
      readonly errorCode: string;
      readonly errorMessage: string;
      readonly retrySafety: McpAdapterRetrySafety;
    };

export interface McpAdapter {
  readonly capabilityKey: string;
  readonly provider: string;
  execute(request: McpAdapterRequest): Promise<McpAdapterExecutionResult>;
}

export class McpAdapterRegistry {
  private readonly adapters = new Map<string, McpAdapter>();

  public register(adapter: McpAdapter): void {
    this.adapters.set(this.createKey(adapter.capabilityKey, adapter.provider), adapter);
  }

  public resolve(capabilityKey: string, provider?: string | null): McpAdapter | undefined {
    if (provider) {
      return this.adapters.get(this.createKey(capabilityKey, provider));
    }

    return Array.from(this.adapters.values()).find(
      (adapter) => adapter.capabilityKey === capabilityKey,
    );
  }

  private createKey(capabilityKey: string, provider: string): string {
    return `${provider}:${capabilityKey}`;
  }
}

export class MockMcpAdapter implements McpAdapter {
  public constructor(
    public readonly capabilityKey: string,
    public readonly provider: string,
    private readonly retrySafety: McpAdapterRetrySafety = "never_retry",
  ) {}

  public execute(request: McpAdapterRequest): Promise<McpAdapterExecutionResult> {
    return Promise.resolve({
      status: "succeeded",
      responsePayload: redactSensitivePayload({
        provider: this.provider,
        capabilityKey: this.capabilityKey,
        invocationId: request.invocationId,
        dryRun: true,
      }),
    });
  }

  public getRetrySafety(): McpAdapterRetrySafety {
    return this.retrySafety;
  }
}

export function isRetryAllowed(retrySafety: McpAdapterRetrySafety): boolean {
  return retrySafety === "retry_if_idempotent" || retrySafety === "retry_transient";
}

export function createDefaultMcpAdapterRegistry(): McpAdapterRegistry {
  const registry = new McpAdapterRegistry();

  registry.register(new MockMcpAdapter("calendar.schedule", "google-calendar", "never_retry"));
  registry.register(new MockMcpAdapter("communication.send", "gmail", "never_retry"));
  registry.register(new MockMcpAdapter("task.create", "jira", "retry_if_idempotent"));
  registry.register(new MockMcpAdapter("knowledge.search", "notion", "retry_transient"));
  registry.register(new MockMcpAdapter("repository.createIssue", "github", "retry_if_idempotent"));

  return registry;
}
