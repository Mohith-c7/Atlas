import { z } from "zod";

const sensitiveKeyPattern =
  /authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|cookie|credential|private[_-]?key/i;
const sensitiveTextPatterns: readonly RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:sk|xoxb|xoxp|xapp)-[A-Za-z0-9-]{12,}\b/g,
  /\b(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi,
];

export const REDACTED_VALUE = "[REDACTED]";

export function redactSensitivePayload(value: unknown): unknown {
  if (typeof value === "string") {
    return sensitiveTextPatterns.reduce(
      (redacted, pattern) => redacted.replace(pattern, REDACTED_VALUE),
      value,
    );
  }

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
type McpAdapterFailureResult = Extract<McpAdapterExecutionResult, { readonly status: "failed" }>;

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

const githubRepositoryStatusPayloadSchema = z
  .object({
    includeIssues: z.boolean().default(true),
    includePullRequests: z.boolean().default(true),
    itemLimit: z.number().int().min(1).max(20).default(5),
  })
  .default({});

const githubIssueResponseSchema = z
  .object({
    id: z.number().int(),
    number: z.number().int(),
    html_url: z.string(),
    state: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const githubRepositoryResponseSchema = z
  .object({
    full_name: z.string(),
    html_url: z.string(),
    description: z.string().nullable().optional(),
    default_branch: z.string().optional(),
    open_issues_count: z.number().int().nonnegative().optional(),
    stargazers_count: z.number().int().nonnegative().optional(),
    forks_count: z.number().int().nonnegative().optional(),
    pushed_at: z.string().nullable().optional(),
  })
  .passthrough();

const githubListItemResponseSchema = z
  .object({
    number: z.number().int(),
    title: z.string(),
    html_url: z.string(),
    state: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type GitHubCredentialPayload = z.infer<typeof githubCredentialPayloadSchema>;
export type GitHubCreateIssuePayload = z.infer<typeof githubCreateIssuePayloadSchema>;
export type GitHubRepositoryStatusPayload = z.infer<typeof githubRepositoryStatusPayloadSchema>;
type GitHubRepositoryStatusListItem = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state?: string;
  readonly updatedAt?: string;
};
type GitHubRepositoryStatusListResult =
  | {
      readonly status: "succeeded";
      readonly items: readonly GitHubRepositoryStatusListItem[];
    }
  | McpAdapterFailureResult;

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
  ): McpAdapterFailureResult {
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

export class GitHubRepositoryStatusAdapter implements McpAdapter {
  public readonly capabilityKey = "repository.summarizeStatus";
  public readonly provider = "github";

  public constructor(
    private readonly credentialResolver: McpCredentialResolver,
    private readonly fetchImplementation: FetchLike = globalThis.fetch,
  ) {}

  public async execute(request: McpAdapterRequest): Promise<McpAdapterExecutionResult> {
    const credentials = await this.resolveCredentials(request);

    if ("status" in credentials) {
      return credentials;
    }

    const parsedPayload = githubRepositoryStatusPayloadSchema.safeParse(
      request.requestPayload ?? {},
    );

    if (!parsedPayload.success) {
      return this.failure(
        "MCP_REQUEST_PAYLOAD_INVALID",
        "GitHub repository status requires optional status-summary settings.",
        "never_retry",
      );
    }

    const credentialPayload = credentials.credentialPayload;
    const repositoryEndpoint = this.buildEndpoint(credentialPayload, "");

    try {
      const repositoryResponse = await this.fetchGitHub(repositoryEndpoint, credentialPayload);

      if (!repositoryResponse.ok) {
        return this.failure(
          this.mapGitHubErrorCode(repositoryResponse.status),
          `GitHub repository status failed with HTTP ${repositoryResponse.status}.`,
          this.mapRetrySafety(repositoryResponse.status),
        );
      }

      const repositoryBody = await repositoryResponse.json();
      const parsedRepository = githubRepositoryResponseSchema.safeParse(repositoryBody);

      if (!parsedRepository.success) {
        return this.failure(
          "MCP_PROVIDER_RESPONSE_INVALID",
          "GitHub returned an unexpected repository response.",
          "retry_transient",
        );
      }

      const openIssuesResult = parsedPayload.data.includeIssues
        ? await this.fetchList(credentialPayload, "issues", parsedPayload.data.itemLimit)
        : { status: "succeeded" as const, items: [] };

      if (openIssuesResult.status === "failed") {
        return openIssuesResult;
      }

      const openPullRequestsResult = parsedPayload.data.includePullRequests
        ? await this.fetchList(credentialPayload, "pulls", parsedPayload.data.itemLimit)
        : { status: "succeeded" as const, items: [] };

      if (openPullRequestsResult.status === "failed") {
        return openPullRequestsResult;
      }

      const openIssues = openIssuesResult.items;
      const openPullRequests = openPullRequestsResult.items;

      return {
        status: "succeeded",
        responsePayload: redactSensitivePayload({
          provider: this.provider,
          capabilityKey: this.capabilityKey,
          integrationId: credentials.integrationId,
          repository: {
            fullName: parsedRepository.data.full_name,
            url: parsedRepository.data.html_url,
            description: parsedRepository.data.description,
            defaultBranch: parsedRepository.data.default_branch,
            openIssuesCount: parsedRepository.data.open_issues_count,
            stargazersCount: parsedRepository.data.stargazers_count,
            forksCount: parsedRepository.data.forks_count,
            pushedAt: parsedRepository.data.pushed_at,
          },
          openIssues,
          openPullRequests,
          summary: this.buildSummary(parsedRepository.data, openIssues, openPullRequests),
        }),
      };
    } catch {
      return this.failure(
        "MCP_PROVIDER_NETWORK_ERROR",
        "GitHub repository status failed due to a provider network error.",
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

  private async resolveCredentials(request: McpAdapterRequest): Promise<
    | {
        readonly integrationId: string;
        readonly credentialPayload: GitHubCredentialPayload;
      }
    | McpAdapterExecutionResult
  > {
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

    return {
      integrationId: credentials.integrationId,
      credentialPayload: parsedCredentials.data,
    };
  }

  private fetchGitHub(endpoint: URL, credentials: GitHubCredentialPayload) {
    return this.fetchImplementation(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${credentials.accessToken}`,
        "User-Agent": "faios-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  }

  private async fetchList(
    credentials: GitHubCredentialPayload,
    resource: "issues" | "pulls",
    itemLimit: number,
  ): Promise<GitHubRepositoryStatusListResult> {
    const endpoint = this.buildEndpoint(credentials, resource);
    endpoint.searchParams.set("state", "open");
    endpoint.searchParams.set("per_page", String(itemLimit));

    const response = await this.fetchGitHub(endpoint, credentials);

    if (!response.ok) {
      return this.failure(
        this.mapGitHubErrorCode(response.status),
        `GitHub repository ${resource} lookup failed with HTTP ${response.status}.`,
        this.mapRetrySafety(response.status),
      );
    }

    const parsed = githubListItemResponseSchema.array().safeParse(await response.json());

    if (!parsed.success) {
      return this.failure(
        "MCP_PROVIDER_RESPONSE_INVALID",
        `GitHub returned an unexpected repository ${resource} response.`,
        "retry_transient",
      );
    }

    return {
      status: "succeeded",
      items: parsed.data.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        state: item.state,
        updatedAt: item.updated_at,
      })),
    };
  }

  private buildEndpoint(credentials: GitHubCredentialPayload, resource: string): URL {
    return new URL(
      `/repos/${encodeURIComponent(credentials.owner)}/${encodeURIComponent(
        credentials.repo,
      )}${resource ? `/${resource}` : ""}`,
      credentials.apiBaseUrl,
    );
  }

  private buildSummary(
    repository: z.infer<typeof githubRepositoryResponseSchema>,
    openIssues: readonly unknown[],
    openPullRequests: readonly unknown[],
  ): string {
    const pushedAt = repository.pushed_at ? ` Last push: ${repository.pushed_at}.` : "";

    return `${repository.full_name} has ${repository.open_issues_count ?? openIssues.length} open issues and ${openPullRequests.length} open pull requests.${pushedAt}`;
  }

  private failure(
    errorCode: string,
    errorMessage: string,
    retrySafety: McpAdapterRetrySafety,
  ): McpAdapterFailureResult {
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
  registry.register(
    options.includeRealProviderAdapters
      ? new GitHubRepositoryStatusAdapter(credentialResolver)
      : new MockMcpAdapter("repository.summarizeStatus", "github", "retry_transient"),
  );

  return registry;
}
