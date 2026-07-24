export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">
          Architecture scaffold
        </p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">
          Founder AI Operating System
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          The founder console shell is ready for voice surfaces, chat commands, MCP integrations,
          and execution history. Business behavior is intentionally deferred.
        </p>
      </section>
    </main>
  );
}
