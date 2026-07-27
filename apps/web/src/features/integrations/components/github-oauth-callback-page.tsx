"use client";

import { useEffect, useRef } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { completeGitHubOAuth } from "../api/integrations-api";
import { IntegrationApiError } from "../types/integration";

function createResultUrl(pathname: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return (serialized ? `${pathname}?${serialized}` : pathname) as Route;
}

function normalizeGitHubError(value: string | null) {
  return value?.replaceAll("_", " ") ?? undefined;
}

export function GitHubOAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const completionStarted = useRef(false);

  useEffect(() => {
    if (completionStarted.current) {
      return;
    }

    completionStarted.current = true;

    const providerError = searchParams.get("error");
    const providerErrorDescription = searchParams.get("error_description");

    if (providerError) {
      router.replace(
        createResultUrl("/integrations/github/oauth/error", {
          code: providerError,
          message: normalizeGitHubError(providerErrorDescription ?? providerError),
        }),
      );
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      router.replace(
        createResultUrl("/integrations/github/oauth/error", {
          code: "GITHUB_OAUTH_CALLBACK_INVALID",
          message: "GitHub did not return the required callback parameters.",
        }),
      );
      return;
    }

    void completeGitHubOAuth({ code, state })
      .then((response) => {
        router.replace(
          createResultUrl("/integrations/github/oauth/success", {
            connectionId: response.connection.id,
            correlationId: response.correlationId,
          }),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof IntegrationApiError) {
          router.replace(
            createResultUrl("/integrations/github/oauth/error", {
              code: error.code,
              correlationId: error.correlationId,
              message: error.message,
            }),
          );
          return;
        }

        router.replace(
          createResultUrl("/integrations/github/oauth/error", {
            code: "GITHUB_OAUTH_COMPLETION_FAILED",
            message: error instanceof Error ? error.message : "Unable to complete GitHub OAuth.",
          }),
        );
      });
  }, [router, searchParams]);

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12 text-foreground">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">GitHub OAuth</p>
      <h1 className="mt-3 text-3xl font-semibold">Completing GitHub connection</h1>
      <p className="mt-4 leading-7 text-muted">
        FAIOS is verifying the callback and linking GitHub to your founder workspace.
      </p>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
      </div>
    </section>
  );
}
