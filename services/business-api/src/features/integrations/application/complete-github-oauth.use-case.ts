import type { CompleteGitHubOAuthResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { GitHubOAuthClient } from "../infrastructure/github-oauth.client.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export class CompleteGitHubOAuthUseCase {
  private readonly repository: IntegrationConnectionRepository;
  private readonly oauthClient: GitHubOAuthClient;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
    this.oauthClient = new GitHubOAuthClient();
  }

  public async execute(
    input: {
      code: string;
      state: string;
    },
    correlationId: string,
    founderSession?: FounderSession,
  ): Promise<CompleteGitHubOAuthResponse> {
    const founder = await resolveFounderAccount(this.database, founderSession);
    const oauthState = await this.repository.consumeOAuthState({
      founderId: founder.id,
      provider: "github",
      state: input.state,
      now: new Date(),
    });

    if (!oauthState || !isRecord(oauthState.metadata)) {
      throw new AppError(
        "GITHUB_OAUTH_STATE_INVALID",
        "GitHub OAuth state is invalid, expired, or already used.",
        400,
      );
    }

    const owner = oauthState.metadata.owner;
    const repo = oauthState.metadata.repo;
    const apiBaseUrl = oauthState.metadata.apiBaseUrl;

    if (typeof owner !== "string" || typeof repo !== "string" || typeof apiBaseUrl !== "string") {
      throw new AppError(
        "GITHUB_OAUTH_STATE_INVALID",
        "GitHub OAuth state did not include repository routing metadata.",
        400,
      );
    }

    const token = await this.oauthClient.exchangeCode({
      code: input.code,
      redirectUri: oauthState.redirectUri,
    });
    const connection = await this.repository.upsertGitHubConnection(founder.id, {
      accountLabel:
        typeof oauthState.metadata.accountLabel === "string"
          ? oauthState.metadata.accountLabel
          : undefined,
      owner,
      repo,
      accessToken: token.accessToken,
      apiBaseUrl,
    });

    return {
      connection,
      correlationId,
    };
  }
}
