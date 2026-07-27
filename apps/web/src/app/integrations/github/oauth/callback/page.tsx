import { Suspense } from "react";

import { GitHubOAuthCallbackPage } from "@/features/integrations/components/github-oauth-callback-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background text-foreground">
          <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
            <p className="text-sm font-medium uppercase tracking-wide text-accent">GitHub OAuth</p>
            <h1 className="mt-3 text-3xl font-semibold">Completing GitHub connection</h1>
          </section>
        </main>
      }
    >
      <main className="min-h-screen bg-background">
        <GitHubOAuthCallbackPage />
      </main>
    </Suspense>
  );
}
