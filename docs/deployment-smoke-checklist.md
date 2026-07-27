# Deployment Smoke Checklist

Use this checklist after deploying any environment that should run founder commands end-to-end.

## Service Health

- `GET /health/live` returns `200` for `business-api`.
- `GET /health/ready` returns `200` for `business-api` and includes `postgres: ok`.
- `GET /health/live` returns `200` for `ai-orchestrator`.
- `GET /health/ready` returns `200` for `ai-orchestrator`.

## Runtime Path

- Prisma migrations are deployed before application pods receive traffic.
- RabbitMQ is reachable with `RABBITMQ_URL`.
- `WORKER_RABBITMQ_CONSUMER_ENABLED=true` is set for the worker runtime.
- `WORKER_REAL_PROVIDER_ADAPTERS_ENABLED=true` is set only where provider credentials are configured.
- `FAIOS_ENCRYPTION_KEY` is a 32-byte base64 key and `FAIOS_ENCRYPTION_KEY_VERSION` is set.

## Founder Workflow

- GitHub OAuth start returns an authorization URL.
- OAuth callback stores an encrypted GitHub credential.
- A voice or chat command creates a plan.
- Approval decision enqueues one execution message.
- Worker completes the invocation and persists a redacted response payload.
- Execution timeline receives `command.execution.snapshot` events.
