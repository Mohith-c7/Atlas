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
  const connectionId = getSearchParam(params, "connectionId");
  const correlationId = getSearchParam(params, "correlationId");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">GitHub OAuth</p>
        <h1 className="mt-3 text-3xl font-semibold">GitHub is connected</h1>
        <p className="mt-4 leading-7 text-muted">
          FAIOS can now use the approved GitHub capabilities for your selected repository.
        </p>

        <dl className="mt-6 grid gap-3 rounded-md border border-border bg-white p-4 text-sm shadow-sm">
          {connectionId ? (
            <div>
              <dt className="font-medium text-foreground">Connection</dt>
              <dd className="mt-1 break-all text-muted">{connectionId}</dd>
            </div>
          ) : null}
          {correlationId ? (
            <div>
              <dt className="font-medium text-foreground">Correlation ID</dt>
              <dd className="mt-1 break-all text-muted">{correlationId}</dd>
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
