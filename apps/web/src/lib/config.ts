export const businessApiUrl =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export const githubOAuthCallbackUrl =
  process.env.NEXT_PUBLIC_GITHUB_OAUTH_CALLBACK_URL ??
  `${businessApiUrl}/api/v1/integrations/github/oauth/callback`;

export const browserSessionToken = process.env.NEXT_PUBLIC_FAIOS_SESSION_TOKEN;
