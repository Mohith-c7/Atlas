import { getPrismaClient } from "@faios/database";

type ReplayOptions = {
  readonly founderId: string;
  readonly jobIds: readonly string[];
  readonly allFailedForFounder: boolean;
  readonly dryRun: boolean;
  readonly limit: number;
};

type ReplayCandidate = {
  readonly id: string;
  readonly founderId: string;
  readonly action: string;
  readonly memoryIds: readonly string[];
  readonly status: string;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly updatedAt: Date;
};

const usage = `
Usage:
  pnpm --filter @faios/workers ops:memory-vector:replay -- --founder-id <id> --job-id <id> [--job-id <id> ...] [--execute]
  pnpm --filter @faios/workers ops:memory-vector:replay -- --founder-id <id> --all-failed-for-founder [--limit <n>] [--execute]

Defaults:
  Runs in dry-run mode unless --execute is provided.

Safety:
  --founder-id is always required.
  Only FAILED MemoryVectorJob rows are eligible.
  Use --all-failed-for-founder only when you intentionally want every failed job for that founder.
`;

function readRequiredValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseReplayOptions(args: readonly string[]): ReplayOptions {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    process.exit(0);
  }

  let founderId: string | undefined;
  const jobIds = new Set<string>();
  let allFailedForFounder = false;
  let execute = false;
  let limit = 50;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--founder-id":
        founderId = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--job-id": {
        const value = readRequiredValue(args, index, arg);
        for (const jobId of value.split(",")) {
          const trimmed = jobId.trim();

          if (trimmed.length > 0) {
            jobIds.add(trimmed);
          }
        }
        index += 1;
        break;
      }
      case "--all-failed-for-founder":
        allFailedForFounder = true;
        break;
      case "--execute":
        execute = true;
        break;
      case "--dry-run":
        execute = false;
        break;
      case "--limit":
        limit = parsePositiveInteger(readRequiredValue(args, index, arg), arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}.`);
    }
  }

  if (!founderId) {
    throw new Error("--founder-id is required.");
  }

  if (jobIds.size === 0 && !allFailedForFounder) {
    throw new Error("Select jobs with --job-id or explicitly pass --all-failed-for-founder.");
  }

  if (jobIds.size > 0 && allFailedForFounder) {
    throw new Error("Use either --job-id or --all-failed-for-founder, not both.");
  }

  return {
    founderId,
    jobIds: [...jobIds],
    allFailedForFounder,
    dryRun: !execute,
    limit,
  };
}

async function findReplayCandidates(options: ReplayOptions): Promise<ReplayCandidate[]> {
  const database = getPrismaClient();

  return database.memoryVectorJob.findMany({
    where: {
      founderId: options.founderId,
      status: "FAILED",
      ...(options.jobIds.length > 0
        ? {
            id: {
              in: [...options.jobIds],
            },
          }
        : {}),
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: options.allFailedForFounder ? options.limit : undefined,
  });
}

async function replayCandidates(input: {
  founderId: string;
  candidates: readonly ReplayCandidate[];
}): Promise<number> {
  const { candidates } = input;

  if (candidates.length === 0) {
    return 0;
  }

  const database = getPrismaClient();
  const result = await database.memoryVectorJob.updateMany({
    where: {
      id: {
        in: candidates.map((candidate) => candidate.id),
      },
      founderId: input.founderId,
      status: "FAILED",
    },
    data: {
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });

  return result.count;
}

function buildSkippedJobIds(
  options: ReplayOptions,
  candidates: readonly ReplayCandidate[],
): string[] {
  if (options.jobIds.length === 0) {
    return [];
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return options.jobIds.filter((jobId) => !candidateIds.has(jobId));
}

async function main(): Promise<void> {
  const options = parseReplayOptions(process.argv.slice(2));
  const candidates = await findReplayCandidates(options);
  const skippedJobIds = buildSkippedJobIds(options, candidates);
  const replayedCount = options.dryRun
    ? 0
    : await replayCandidates({
        founderId: options.founderId,
        candidates,
      });

  process.stdout.write(
    `${JSON.stringify(
      {
        dryRun: options.dryRun,
        founderId: options.founderId,
        selectedMode: options.allFailedForFounder ? "all_failed_for_founder" : "job_ids",
        candidateCount: candidates.length,
        replayedCount,
        skippedJobIds,
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          action: candidate.action,
          memoryCount: candidate.memoryIds.length,
          retryCount: candidate.retryCount,
          maxRetries: candidate.maxRetries,
          updatedAt: candidate.updatedAt.toISOString(),
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown replay tooling failure.";
    process.stderr.write(`${message}\n${usage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void getPrismaClient().$disconnect();
  });
