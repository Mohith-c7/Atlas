const GITHUB_OAUTH_CALLBACK_PATH = "/integrations/github/oauth/callback";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function getGitHubOAuthCallbackUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_GITHUB_OAUTH_CALLBACK_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${GITHUB_OAUTH_CALLBACK_PATH}`;
  }

  const appUrl = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "http://localhost:3000";
  return `${normalizeBaseUrl(appUrl)}${GITHUB_OAUTH_CALLBACK_PATH}`;
}
