# Local GitHub E2E Smoke Test

## Purpose

The GitHub E2E smoke test proves the first real FAIOS operating-system workflow without calling the real GitHub API.

It exercises:

- AI Orchestrator planning
- Business API use cases
- encrypted GitHub credential setup
- approval creation and decision
- RabbitMQ execution dispatch
- worker invocation claiming
- real GitHub MCP adapter
- local fake GitHub HTTP server
- command and invocation completion state

## Command

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres rabbitmq
DATABASE_URL="postgresql://faios:faios@localhost:5432/faios_integration?schema=public" \
RABBITMQ_URL="amqp://faios:faios@localhost:5672" \
pnpm --filter @faios/database exec prisma migrate deploy --schema prisma/schema.prisma

DATABASE_URL="postgresql://faios:faios@localhost:5432/faios_integration?schema=public" \
RABBITMQ_URL="amqp://faios:faios@localhost:5672" \
pnpm smoke:github:e2e
```

PowerShell:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d postgres rabbitmq
$env:DATABASE_URL="postgresql://faios:faios@localhost:5432/faios_integration?schema=public"
$env:RABBITMQ_URL="amqp://faios:faios@localhost:5672"
pnpm --filter @faios/database exec prisma migrate deploy --schema prisma/schema.prisma
pnpm smoke:github:e2e
```

## What It Verifies

- GitHub credentials are stored encrypted.
- The planner creates a `repository.createIssue` step.
- GitHub issue creation requires approval.
- Approval dispatches a RabbitMQ execution message.
- The worker executes the real GitHub adapter.
- The adapter sends the decrypted token only to the fake provider at runtime.
- Persisted invocation response contains the fake issue URL.
- Persisted payloads do not contain the GitHub token.

## Notes

The script starts AI Orchestrator on a random local port and starts its own fake GitHub HTTP server. It cleans up only its generated smoke-test founder.
