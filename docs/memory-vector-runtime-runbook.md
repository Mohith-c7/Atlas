# Memory Vector Runtime Runbook

This runbook covers the durable memory vector job runtime introduced in M14. The runtime keeps founder-facing memory writes fast by moving embedding generation and Qdrant synchronization into the worker process.

## Runtime Model

- The Business API writes `MemoryVectorJob` rows after memory mutations.
- RabbitMQ messages are wake-up hints, not the source of truth.
- The worker claims due `PENDING` jobs from PostgreSQL, marks them `RUNNING`, performs embedding and Qdrant sync, then marks them `SUCCEEDED`.
- Retryable failures move the job back to `PENDING` with `nextAttemptAt`.
- Exhausted failures become `FAILED`; RabbitMQ-consumed exhausted messages are routed to the configured dead-letter queue.

## Required Configuration

- `DATABASE_URL`: PostgreSQL connection used by API and workers.
- `RABBITMQ_URL`: Required when RabbitMQ consumers or dispatch are enabled.
- `QDRANT_URL`: Qdrant endpoint used by the memory vector repository.
- `QDRANT_MEMORY_COLLECTION`: Qdrant collection for founder memory vectors.
- `MEMORY_EMBEDDING_PROVIDER`: `auto`, `openai`, or `deterministic`.
- `OPENAI_API_KEY`: Required when OpenAI embeddings are used.
- `MEMORY_VECTOR_JOB_DISPATCH_ENABLED`: Enables RabbitMQ wake-up publishing from the API.
- `WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED`: Enables RabbitMQ memory vector consumer.
- `WORKER_MEMORY_VECTOR_LOOP_ENABLED`: Enables database polling recovery loop.
- `MEMORY_VECTOR_JOB_MAX_ATTEMPTS`: Total attempts before failure.
- `MEMORY_VECTOR_RETRY_BASE_DELAY_MS`: Initial retry delay.
- `MEMORY_VECTOR_RETRY_MAX_DELAY_MS`: Maximum retry delay.

## Local Startup

1. Start dependencies:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres rabbitmq qdrant
```

2. Apply migrations:

```bash
pnpm --filter @faios/database exec prisma migrate deploy --schema prisma/schema.prisma
```

3. Run the worker with memory vector processing enabled:

```bash
WORKER_MEMORY_VECTOR_LOOP_ENABLED=true pnpm --filter @faios/workers dev
```

4. For RabbitMQ wake-ups, also enable:

```bash
MEMORY_VECTOR_JOB_DISPATCH_ENABLED=true WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED=true
```

## Operational Checks

Use PostgreSQL to inspect job health:

```sql
SELECT status, count(*)
FROM "MemoryVectorJob"
GROUP BY status
ORDER BY status;
```

Find retry pressure:

```sql
SELECT id, "founderId", action, "retryCount", "maxRetries", "nextAttemptAt", "errorCode"
FROM "MemoryVectorJob"
WHERE status IN ('PENDING', 'FAILED')
ORDER BY "updatedAt" DESC
LIMIT 50;
```

Find stale running jobs:

```sql
SELECT id, "founderId", action, "startedAt", "updatedAt"
FROM "MemoryVectorJob"
WHERE status = 'RUNNING'
  AND "updatedAt" < now() - interval '15 minutes'
ORDER BY "updatedAt" ASC;
```

## Incident Response

### Queue Buildup

1. Confirm worker pods are running.
2. Confirm `WORKER_MEMORY_VECTOR_LOOP_ENABLED=true` in the worker environment.
3. Confirm RabbitMQ consumers are enabled only when `RABBITMQ_URL` is healthy.
4. Check the count of due `PENDING` jobs.
5. Increase worker replicas or `MEMORY_VECTOR_WORKER_CONCURRENCY` only after PostgreSQL and Qdrant latency are healthy.

### Embedding Provider Outage

1. Expect jobs to retry with exponential backoff.
2. Keep API request paths online; memory writes should continue to enqueue jobs.
3. If outage is prolonged, temporarily switch to `MEMORY_EMBEDDING_PROVIDER=deterministic` only for non-production recovery environments.
4. Replay failed jobs after provider recovery.

### Qdrant Outage

1. Expect memory search to fall back to database-backed lexical matching where implemented.
2. Keep `WORKER_MEMORY_VECTOR_LOOP_ENABLED=true` so due jobs recover after Qdrant returns.
3. Replay failed jobs after Qdrant collection health is restored.

### Dead-Letter Growth

1. Inspect `MemoryVectorJob` rows with `status='FAILED'`.
2. Confirm dead-letter payloads include IDs and correlation metadata only.
3. Do not manually republish DLQ payloads without reconciling the durable job row.
4. Prefer replaying from PostgreSQL job state so idempotency and retry limits remain controlled.

## Replay Safety

- Replay only `FAILED` jobs that have been inspected or match a known recovered outage window.
- Prefer dry-run output before changing job state.
- Resetting a job to `PENDING` must clear `completedAt` and set `nextAttemptAt` to `now()` or `null`.
- Do not change `founderId`, `action`, or `memoryIds` during replay.
- Keep replay commands founder-scoped when responding to a single founder support case.

## Completion Gate

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @faios/workers test:integration`
