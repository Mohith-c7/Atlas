import { AppError } from "../../../lib/errors.js";

type GitHubOAuthTokenResponse = {
  readonly access_token?: unknown;
  readonly token_type?: unknown;
  readonly scope?: unknown;
  readonly error?: unknown;
  readonly error_description?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export class GitHubOAuthClient {
  public constructor(
    private readonly tokenUrl = process.env.GITHUB_OAUTH_TOKEN_URL ??
      "https://github.com/login/oauth/access_token",
    private readonly clientId = process.env.GITHUB_OAUTH_CLIENT_ID,
    private readonly clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET,
  ) {}

  public buildAuthorizationUrl(input: {
    readonly state: string;
    readonly redirectUri: string;
  }): string {
    if (!this.clientId) {
      throw new AppError(
        "GITHUB_OAUTH_NOT_CONFIGURED",
        "GitHub OAuth client ID is not configured.",
        500,
      );
    }

    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", this.clientId);
    authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
    authorizationUrl.searchParams.set("state", input.state);
    authorizationUrl.searchParams.set("scope", "repo");

    return authorizationUrl.toString();
  }

  public async exchangeCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<{ accessToken: string; scope?: string }> {
    if (!this.clientId || !this.clientSecret) {
      throw new AppError(
        "GITHUB_OAUTH_NOT_CONFIGURED",
        "GitHub OAuth client credentials are not configured.",
        500,
      );
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    });

    let payload: GitHubOAuthTokenResponse;

    try {
      payload = (await response.json()) as GitHubOAuthTokenResponse;
    } catch {
      throw new AppError(
        "GITHUB_OAUTH_RESPONSE_INVALID",
        "GitHub OAuth token response was not valid JSON.",
        502,
      );
    }

    if (!response.ok || payload.error) {
      throw new AppError(
        "GITHUB_OAUTH_EXCHANGE_FAILED",
        isRecord(payload) && typeof payload.error_description === "string"
          ? payload.error_description
          : "GitHub OAuth token exchange failed.",
        502,
      );
    }

    if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
      throw new AppError(
        "GITHUB_OAUTH_RESPONSE_INVALID",
        "GitHub OAuth token response did not include an access token.",
        502,
      );
    }

    return {
      accessToken: payload.access_token,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
    };
  }
}
