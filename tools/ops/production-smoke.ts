type SmokeTarget = {
  readonly name: string;
  readonly url: string;
  readonly expectedStatus: number;
};

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseTargets(args: readonly string[]): SmokeTarget[] {
  const webUrl = readFlag(args, "--web-url") ?? process.env.FAIOS_SMOKE_WEB_URL;
  const apiUrl = readFlag(args, "--api-url") ?? process.env.FAIOS_SMOKE_API_URL;
  const orchestratorUrl =
    readFlag(args, "--orchestrator-url") ?? process.env.FAIOS_SMOKE_ORCHESTRATOR_URL;

  return [
    webUrl ? { name: "web", url: webUrl, expectedStatus: 200 } : undefined,
    apiUrl
      ? {
          name: "business-api-ready",
          url: `${apiUrl.replace(/\/$/, "")}/health/ready`,
          expectedStatus: 200,
        }
      : undefined,
    orchestratorUrl
      ? {
          name: "ai-orchestrator-ready",
          url: `${orchestratorUrl.replace(/\/$/, "")}/health/ready`,
          expectedStatus: 200,
        }
      : undefined,
  ].filter((target): target is SmokeTarget => Boolean(target));
}

async function probe(target: SmokeTarget, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        "x-correlation-id": `production-smoke-${crypto.randomUUID()}`,
      },
    });

    await response.arrayBuffer();

    return {
      ...target,
      latencyMs: Math.round(performance.now() - startedAt),
      observedStatus: response.status,
      passed: response.status === target.expectedStatus,
      traceId: response.headers.get("x-trace-id"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const timeoutMs = Number(readFlag(args, "--timeout-ms") ?? 5000);
  const targets = parseTargets(args);

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }

  if (targets.length === 0) {
    throw new Error(
      "Provide at least one target via --web-url, --api-url, --orchestrator-url, or FAIOS_SMOKE_* env vars.",
    );
  }

  const results = await Promise.all(targets.map((target) => probe(target, timeoutMs)));
  const failed = results.filter((result) => !result.passed);

  console.log(JSON.stringify({ passed: failed.length === 0, results }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
