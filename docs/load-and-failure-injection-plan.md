# FAIOS Load Test And Failure Injection Plan

This document defines the bounded M17 test plan for reliability learning before production launch.

## HTTP Load Smoke

Use the built-in smoke script for low-risk endpoint probing:

```bash
pnpm ops:load:http -- --url http://localhost:4000/health/ready --duration-ms 30000 --concurrency 8
```

The script reports:

- request count
- failure count
- failure rate
- P50/P95/P99 latency
- status code distribution

Pass criteria for local smoke:

- Failure rate is 0 when dependencies are healthy.
- P95 remains under 500 ms for readiness.

Production-grade load tests should later use k6 or an equivalent runner with founder command, approval, memory, and integration scenarios.

## Planned Failure Probe

During a controlled outage drill, use:

```bash
pnpm ops:failure:http -- --url http://localhost:4000/health/ready --expected-status 503
```

The script verifies that an unhealthy dependency produces the expected degraded status instead of a misleading healthy response.

## Failure Injection Scenarios

### PostgreSQL unavailable

Steps:

1. Stop or firewall the local Postgres dependency.
2. Run the failure probe against `/health/ready`.
3. Confirm Business API readiness returns `503`.
4. Restart Postgres.
5. Confirm readiness returns `200`.

Expected result:

- Readiness fails closed.
- Liveness remains independent.
- Logs include correlation IDs.

### RabbitMQ unavailable

Steps:

1. Enable RabbitMQ-backed worker consumption in a non-production environment.
2. Stop RabbitMQ.
3. Start the worker.
4. Confirm startup readiness fails with a clear RabbitMQ error.
5. Restore RabbitMQ and restart the worker.

Expected result:

- Worker does not silently run with a missing queue transport.
- Durable database jobs remain replayable.

### Embedding provider degraded

Steps:

1. Use an invalid embedding API key in a non-production environment.
2. Create memory vector jobs.
3. Confirm retries are scheduled.
4. Restore provider configuration.
5. Replay failed jobs only if retry exhaustion occurred.

Expected result:

- Jobs move to retry state before terminal failure.
- Payloads remain redacted in logs.

### Qdrant unavailable

Steps:

1. Stop Qdrant.
2. Start memory-vector worker runtime.
3. Confirm readiness fails or jobs retry.
4. Restore Qdrant.
5. Confirm queue drains.

Expected result:

- API request paths continue enqueueing durable jobs.
- Worker retries safely.

## Evidence To Capture

Each drill should capture:

- environment
- dependency disabled
- start and end timestamps
- correlation IDs
- metrics screenshots
- queue depth before and after
- failed job IDs
- replay command output when used
