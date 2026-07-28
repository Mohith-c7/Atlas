# FAIOS Observability And Reliability Runbook

This runbook defines the first production operating model for Founder AI Operating System services.
It covers the Business API and worker runtime. Security incident response remains tracked under M16.

## Scrape Targets

| Service      | Endpoint            | Enablement                | Notes                                                                  |
| ------------ | ------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Business API | `GET /metrics`      | Always available          | Prometheus text format with HTTP and process metrics.                  |
| Workers      | `GET /metrics`      | Set `WORKER_METRICS_PORT` | Prometheus text format with process and memory-vector runtime metrics. |
| Business API | `GET /health/live`  | Always available          | Process liveness only.                                                 |
| Business API | `GET /health/ready` | Always available          | Postgres readiness.                                                    |

## Core Correlation Fields

Every investigation should start with these fields:

- `x-correlation-id`: request and command correlation.
- `founderId`: founder scope. Never use email as the primary join key in logs.
- `commandId`: founder command lifecycle.
- `executionId`: MCP execution lifecycle.
- `jobId`: durable background job lifecycle.

Payload logs must stay redacted. Operators should use IDs and sanitized summaries, not provider payload bodies.

## First Response Flow

1. Check service readiness.
   - Business API: `/health/ready`
   - Worker metrics scrape: `/metrics` on `WORKER_METRICS_PORT`
2. Check queue symptoms.
   - Memory vector queue depth.
   - Retry scheduled count.
   - Dead-letter count.
3. Check provider symptoms.
   - Provider latency totals and samples.
   - Recent retry/failure logs by `correlationId`.
4. Check database symptoms.
   - API readiness.
   - Worker startup readiness logs.
   - Slow query and connection pool metrics from the managed Postgres provider.
5. Choose the narrowest recovery path.
   - Replay failed memory vector jobs only after the downstream dependency is healthy.
   - Do not replay all failed jobs globally.
   - Prefer founder-scoped replay commands.

## Provider Outage

Symptoms:

- Increased command execution failures.
- Increased memory-vector retry scheduling.
- Provider latency spikes.

Actions:

1. Confirm provider status externally.
2. Disable dispatch if request-path admission must stop creating new downstream work.
3. Let retry-safe jobs remain pending until provider recovery.
4. Replay exhausted jobs founder-by-founder after the provider is stable.
5. Record the provider, impacted founders, start time, end time, and replay job IDs.

## Queue Buildup

Symptoms:

- Queue depth increases for multiple scrape intervals.
- Processing latency increases.
- Retry count rises faster than success count.

Actions:

1. Verify worker replicas are healthy.
2. Verify `MEMORY_VECTOR_WORKER_CONCURRENCY` and worker pod CPU/memory limits.
3. Scale workers before increasing concurrency.
4. If downstream Qdrant or model latency is high, do not increase concurrency.
5. When stable, replay failed jobs with `pnpm --filter @faios/workers ops:memory-vector:replay`.

## Database Outage

Symptoms:

- Business API readiness returns `503`.
- Worker startup readiness fails.
- Durable job claim/update errors appear in worker logs.

Actions:

1. Stop deploying new versions.
2. Confirm managed Postgres incident status.
3. Keep liveness separate from readiness so pods do not churn unnecessarily.
4. After recovery, verify migration status and run a founder-scoped data consistency check.
5. Replay only jobs that failed during the outage window.

## Model Or Embedding Outage

Symptoms:

- Memory vector jobs retry with embedding provider errors.
- Semantic memory search falls back or loses relevance.

Actions:

1. Confirm model provider health and rate limits.
2. Temporarily switch `MEMORY_EMBEDDING_PROVIDER=deterministic` only in non-production.
3. In production, prefer retry delay and capacity reduction over changing embedding providers.
4. Replay failed vector jobs once provider behavior is stable.

## Retry Exhaustion

Exhausted jobs are intentionally not replayed automatically. Use:

```bash
pnpm --filter @faios/workers ops:memory-vector:replay -- --founder-id <founder-id> --job-id <job-id>
pnpm --filter @faios/workers ops:memory-vector:replay -- --founder-id <founder-id> --job-id <job-id> --execute
```

Rules:

- Dry-run first.
- Founder scope is mandatory.
- Use `--all-failed-for-founder` only after confirming impact and dependency recovery.
- Keep the replay output in the incident notes.

## Trace Context

The Business API accepts `traceparent` and `x-trace-id`, derives a trace id from `x-correlation-id`
when no trace header is present, and returns `traceparent`, `x-trace-id`, and `x-correlation-id` on
responses. Set `FAIOS_TRACING_ENABLED=true` to mark generated trace contexts as sampled while the
platform is still exporter-neutral. `OTEL_EXPORTER_OTLP_ENDPOINT` is reserved for the production
OpenTelemetry exporter wiring.

RabbitMQ workers now cap concurrency through `WORKER_EXECUTION_CONCURRENCY` and
`MEMORY_VECTOR_WORKER_CONCURRENCY`. Keep these values aligned with provider rate limits, database
pool size, and command latency SLOs.
