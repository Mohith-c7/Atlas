import Link from "next/link";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const code = getSearchParam(params, "code") ?? "GITHUB_OAUTH_FAILED";
  const message =
    getSearchParam(params, "message") ?? "FAIOS could not complete the GitHub connection.";
  const correlationId = getSearchParam(params, "correlationId");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-red-700">GitHub OAuth</p>
        <h1 className="mt-3 text-3xl font-semibold">GitHub connection failed</h1>
        <p className="mt-4 leading-7 text-muted">{message}</p>

        <dl className="mt-6 grid gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div>
            <dt className="font-medium">Error code</dt>
            <dd className="mt-1 break-all">{code}</dd>
          </div>
          {correlationId ? (
            <div>
              <dt className="font-medium">Correlation ID</dt>
              <dd className="mt-1 break-all">{correlationId}</dd>
            </div>
          ) : null}
        </dl>

        <Link
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-white transition hover:bg-foreground/90"
          href="/"
        >
          Back to integrations
        </Link>
      </section>
    </main>
  );
}
