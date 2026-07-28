type FailureProbeOptions = {
  readonly url: string;
  readonly expectedStatus: number;
  readonly timeoutMs: number;
};

function parseOptions(args: readonly string[]): FailureProbeOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  return {
    url: readFlag(args, "--url") ?? "http://localhost:4000/health/ready",
    expectedStatus: Number(readFlag(args, "--expected-status") ?? 503),
    timeoutMs: Number(readFlag(args, "--timeout-ms") ?? 5000),
  };
}

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`Usage: pnpm ops:failure:http -- --url http://localhost:4000/health/ready

Options:
  --url <url>                Endpoint to probe during a planned dependency outage.
  --expected-status <code>   Expected HTTP status. Defaults to 503.
  --timeout-ms <number>      Probe timeout. Defaults to 5000.`);
}

async function probe({ url, expectedStatus, timeoutMs }: FailureProbeOptions): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-correlation-id": `failure-probe-${crypto.randomUUID()}`,
      },
    });

    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus} from ${url}, received ${response.status}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          url,
          expectedStatus,
          observedStatus: response.status,
          passed: true,
        },
        null,
        2,
      ),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (
    !Number.isInteger(options.expectedStatus) ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs <= 0
  ) {
    throw new Error("expected-status and timeout-ms must be valid positive integers.");
  }

  await probe(options);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
