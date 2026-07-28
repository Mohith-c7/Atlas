type LoadSmokeOptions = {
  readonly url: string;
  readonly durationMs: number;
  readonly concurrency: number;
  readonly timeoutMs: number;
};

type RequestResult = {
  readonly ok: boolean;
  readonly status: number;
  readonly latencyMs: number;
};

function parseOptions(args: readonly string[]): LoadSmokeOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  return {
    url: readFlag(args, "--url") ?? "http://localhost:4000/health/ready",
    durationMs: Number(readFlag(args, "--duration-ms") ?? 30000),
    concurrency: Number(readFlag(args, "--concurrency") ?? 8),
    timeoutMs: Number(readFlag(args, "--timeout-ms") ?? 5000),
  };
}

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function timedFetch(url: string, timeoutMs: number): Promise<RequestResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-correlation-id": `load-smoke-${crypto.randomUUID()}`,
      },
    });

    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function runWorker(options: LoadSmokeOptions, deadline: number): Promise<RequestResult[]> {
  const results: RequestResult[] = [];

  while (Date.now() < deadline) {
    results.push(await timedFetch(options.url, options.timeoutMs));
  }

  return results;
}

function printHelp(): void {
  console.log(`Usage: pnpm ops:load:http -- --url http://localhost:4000/health/ready

Options:
  --url <url>             Endpoint to probe. Defaults to business-api readiness.
  --duration-ms <number>  Test duration. Defaults to 30000.
  --concurrency <number>  Concurrent workers. Defaults to 8.
  --timeout-ms <number>   Per-request timeout. Defaults to 5000.`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (
    !Number.isInteger(options.durationMs) ||
    !Number.isInteger(options.concurrency) ||
    !Number.isInteger(options.timeoutMs) ||
    options.durationMs <= 0 ||
    options.concurrency <= 0 ||
    options.timeoutMs <= 0
  ) {
    throw new Error("duration-ms, concurrency, and timeout-ms must be positive integers.");
  }

  const deadline = Date.now() + options.durationMs;
  const results = (
    await Promise.all(
      Array.from({ length: options.concurrency }, () => runWorker(options, deadline)),
    )
  ).flat();
  const latencies = results.map((result) => result.latencyMs);
  const failures = results.filter((result) => !result.ok).length;
  const statusCounts = new Map<number, number>();

  for (const result of results) {
    statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        url: options.url,
        requests: results.length,
        failures,
        failureRate: results.length > 0 ? failures / results.length : 0,
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        statusCounts: Object.fromEntries(statusCounts),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
