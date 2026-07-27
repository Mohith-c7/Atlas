export const businessApiUrl =
  process.env.NEXT_PUBLIC_BUSINESS_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export const webAppUrl =
  process.env.NEXT_PUBLIC_WEB_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const githubOAuthCallbackUrl =
  process.env.NEXT_PUBLIC_GITHUB_OAUTH_CALLBACK_URL ??
  `${webAppUrl}/integrations/github/oauth/callback`;

export const browserSessionToken = process.env.NEXT_PUBLIC_FAIOS_SESSION_TOKEN;
