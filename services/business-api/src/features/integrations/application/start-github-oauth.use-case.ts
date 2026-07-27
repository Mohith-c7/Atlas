import { randomBytes } from "node:crypto";
import type { StartGitHubOAuthRequest, StartGitHubOAuthResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { GitHubOAuthClient } from "../infrastructure/github-oauth.client.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class StartGitHubOAuthUseCase {
  private readonly repository: IntegrationConnectionRepository;
  private readonly oauthClient: GitHubOAuthClient;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
    this.oauthClient = new GitHubOAuthClient();
  }

  public async execute(
    request: StartGitHubOAuthRequest,
    correlationId: string,
    founderSession?: FounderSession,
  ): Promise<StartGitHubOAuthResponse> {
    const founder = await resolveFounderAccount(this.database, founderSession);
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    const authorizationUrl = this.oauthClient.buildAuthorizationUrl({
      state,
      redirectUri: request.redirectUri,
    });

    await this.repository.createOAuthState({
      founderId: founder.id,
      provider: "github",
      state,
      redirectUri: request.redirectUri,
      expiresAt,
      metadata: {
        accountLabel: request.accountLabel,
        owner: request.owner,
        repo: request.repo,
        apiBaseUrl: request.apiBaseUrl,
      },
    });

    return {
      authorizationUrl,
      state,
      expiresAt: expiresAt.toISOString(),
      correlationId,
    };
  }
}
