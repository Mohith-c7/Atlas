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

export type McpCredentialResolutionRequest = {
  readonly founderId: string;
  readonly provider: string;
  readonly capabilityKey: string;
};

export type McpResolvedCredentials = {
  readonly integrationId: string;
  readonly provider: string;
  readonly accountLabel?: string | null;
  readonly capabilityKeys: readonly string[];
  readonly metadata?: unknown;
  readonly credentialPayload: unknown;
};

export type McpCredentialUnavailableReason = {
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retrySafety: McpAdapterRetrySafety;
};

export type McpAdapterReadiness =
  | {
      readonly status: "ready";
      readonly provider: string;
      readonly capabilityKey: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: "not_ready";
      readonly provider: string;
      readonly capabilityKey: string;
      readonly reason: string;
      readonly checkedAt: string;
    };

export interface McpCredentialResolver {
  resolveCredentials(
    request: McpCredentialResolutionRequest,
  ): Promise<McpResolvedCredentials | undefined>;
  getCredentialUnavailableReason?(
    request: McpCredentialResolutionRequest,
  ): Promise<McpCredentialUnavailableReason | undefined>;
}

export interface McpAdapter {
  readonly capabilityKey: string;
  readonly provider: string;
  execute(request: McpAdapterRequest): Promise<McpAdapterExecutionResult>;
  checkReadiness?(founderId: string): Promise<McpAdapterReadiness>;
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

  public async listReadiness(founderId: string): Promise<McpAdapterReadiness[]> {
    return Promise.all(
      Array.from(this.adapters.values()).map((adapter) =>
        adapter.checkReadiness
          ? adapter.checkReadiness(founderId)
          : Promise.resolve<McpAdapterReadiness>({
              status: "ready",
              provider: adapter.provider,
              capabilityKey: adapter.capabilityKey,
              checkedAt: new Date().toISOString(),
            }),
      ),
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

export type FetchLike = (
  input: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

const githubCredentialPayloadSchema = z.object({
  accessToken: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  apiBaseUrl: z.string().url().default("https://api.github.com"),
});

const githubCreateIssuePayloadSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(65536).optional(),
  labels: z.array(z.string().min(1)).max(20).optional(),
});

const githubIssueResponseSchema = z
  .object({
    id: z.number().int(),
    number: z.number().int(),
    html_url: z.string(),
    state: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

export type GitHubCredentialPayload = z.infer<typeof githubCredentialPayloadSchema>;
export type GitHubCreateIssuePayload = z.infer<typeof githubCreateIssuePayloadSchema>;

export class GitHubCreateIssueAdapter implements McpAdapter {
  public readonly capabilityKey = "repository.createIssue";
  public readonly provider = "github";

  public constructor(
    private readonly credentialResolver: McpCredentialResolver,
    private readonly fetchImplementation: FetchLike = globalThis.fetch,
  ) {}

  public async execute(request: McpAdapterRequest): Promise<McpAdapterExecutionResult> {
    const credentials = await this.credentialResolver.resolveCredentials({
      founderId: request.founderId,
      provider: this.provider,
      capabilityKey: this.capabilityKey,
    });

    if (!credentials) {
      const unavailableReason = await this.credentialResolver.getCredentialUnavailableReason?.({
        founderId: request.founderId,
        provider: this.provider,
        capabilityKey: this.capabilityKey,
      });

      if (unavailableReason) {
        return this.failure(
          unavailableReason.errorCode,
          unavailableReason.errorMessage,
          unavailableReason.retrySafety,
        );
      }

      return this.failure(
        "MCP_CREDENTIALS_NOT_FOUND",
        "GitHub credentials are not connected for this founder.",
        "never_retry",
      );
    }

    const parsedCredentials = githubCredentialPayloadSchema.safeParse(
      credentials.credentialPayload,
    );

    if (!parsedCredentials.success) {
      return this.failure(
        "MCP_CREDENTIALS_INVALID",
        "GitHub credentials are invalid or incomplete.",
        "never_retry",
      );
    }

    const parsedPayload = githubCreateIssuePayloadSchema.safeParse(request.requestPayload);

    if (!parsedPayload.success) {
      return this.failure(
        "MCP_REQUEST_PAYLOAD_INVALID",
        "GitHub issue creation requires a title and optional body or labels.",
        "never_retry",
      );
    }

    const credentialPayload = parsedCredentials.data;
    const endpoint = new URL(
      `/repos/${encodeURIComponent(credentialPayload.owner)}/${encodeURIComponent(
        credentialPayload.repo,
      )}/issues`,
      credentialPayload.apiBaseUrl,
    );

    try {
      const response = await this.fetchImplementation(endpoint.toString(), {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${credentialPayload.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "faios-worker",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(parsedPayload.data),
      });

      if (!response.ok) {
        return this.failure(
          this.mapGitHubErrorCode(response.status),
          `GitHub issue creation failed with HTTP ${response.status}.`,
          this.mapRetrySafety(response.status),
        );
      }

      const responseBody = await response.json();
      const parsedResponse = githubIssueResponseSchema.safeParse(responseBody);

      if (!parsedResponse.success) {
        return this.failure(
          "MCP_PROVIDER_RESPONSE_INVALID",
          "GitHub returned an unexpected issue response.",
          "retry_transient",
        );
      }

      return {
        status: "succeeded",
        responsePayload: redactSensitivePayload({
          provider: this.provider,
          capabilityKey: this.capabilityKey,
          integrationId: credentials.integrationId,
          issueId: parsedResponse.data.id,
          issueNumber: parsedResponse.data.number,
          issueUrl: parsedResponse.data.html_url,
          state: parsedResponse.data.state,
          title: parsedResponse.data.title,
        }),
      };
    } catch {
      return this.failure(
        "MCP_PROVIDER_NETWORK_ERROR",
        "GitHub issue creation failed due to a provider network error.",
        "retry_transient",
      );
    }
  }

  public async checkReadiness(founderId: string): Promise<McpAdapterReadiness> {
    const checkedAt = new Date().toISOString();
    const credentials = await this.credentialResolver.resolveCredentials({
      founderId,
      provider: this.provider,
      capabilityKey: this.capabilityKey,
    });

    if (!credentials) {
      const unavailableReason = await this.credentialResolver.getCredentialUnavailableReason?.({
        founderId,
        provider: this.provider,
        capabilityKey: this.capabilityKey,
      });

      return {
        status: "not_ready",
        provider: this.provider,
        capabilityKey: this.capabilityKey,
        reason:
          unavailableReason?.errorMessage ??
          "GitHub credentials are not connected for this founder.",
        checkedAt,
      };
    }

    const parsedCredentials = githubCredentialPayloadSchema.safeParse(
      credentials.credentialPayload,
    );

    if (!parsedCredentials.success) {
      return {
        status: "not_ready",
        provider: this.provider,
        capabilityKey: this.capabilityKey,
        reason: "GitHub credentials are invalid or incomplete.",
        checkedAt,
      };
    }

    return {
      status: "ready",
      provider: this.provider,
      capabilityKey: this.capabilityKey,
      checkedAt,
    };
  }

  private failure(
    errorCode: string,
    errorMessage: string,
    retrySafety: McpAdapterRetrySafety,
  ): McpAdapterExecutionResult {
    return {
      status: "failed",
      errorCode,
      errorMessage,
      retrySafety,
    };
  }

  private mapGitHubErrorCode(status: number): string {
    if (status === 401 || status === 403) {
      return "MCP_PROVIDER_UNAUTHORIZED";
    }

    if (status === 404) {
      return "MCP_PROVIDER_RESOURCE_NOT_FOUND";
    }

    if (status === 422) {
      return "MCP_PROVIDER_VALIDATION_FAILED";
    }

    if (status === 429) {
      return "MCP_PROVIDER_RATE_LIMITED";
    }

    if (status >= 500) {
      return "MCP_PROVIDER_UNAVAILABLE";
    }

    return "MCP_PROVIDER_REQUEST_FAILED";
  }

  private mapRetrySafety(status: number): McpAdapterRetrySafety {
    if (status === 429 || status >= 500) {
      return "retry_transient";
    }

    return "never_retry";
  }
}

export class EmptyMcpCredentialResolver implements McpCredentialResolver {
  public resolveCredentials(): Promise<McpResolvedCredentials | undefined> {
    return Promise.resolve(undefined);
  }
}

export function isRetryAllowed(retrySafety: McpAdapterRetrySafety): boolean {
  return retrySafety === "retry_if_idempotent" || retrySafety === "retry_transient";
}

export type DefaultMcpAdapterRegistryOptions = {
  readonly credentialResolver?: McpCredentialResolver;
  readonly includeRealProviderAdapters?: boolean;
};

export function createDefaultMcpAdapterRegistry(
  options: DefaultMcpAdapterRegistryOptions = {},
): McpAdapterRegistry {
  const registry = new McpAdapterRegistry();
  const credentialResolver = options.credentialResolver ?? new EmptyMcpCredentialResolver();

  registry.register(new MockMcpAdapter("calendar.schedule", "google-calendar", "never_retry"));
  registry.register(new MockMcpAdapter("communication.send", "gmail", "never_retry"));
  registry.register(new MockMcpAdapter("task.create", "jira", "retry_if_idempotent"));
  registry.register(new MockMcpAdapter("knowledge.search", "notion", "retry_transient"));
  registry.register(
    options.includeRealProviderAdapters
      ? new GitHubCreateIssueAdapter(credentialResolver)
      : new MockMcpAdapter("repository.createIssue", "github", "retry_if_idempotent"),
  );

  return registry;
}
