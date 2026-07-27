# Execution Validation And Gaps

## Scope Reviewed

This validation covers the current founder-command execution path:

- Founder command intake
- AI planning
- Capability filtering
- Approval creation and decision
- Tool invocation enqueueing
- RabbitMQ execution dispatch
- Worker claiming
- Retry scheduling
- Execution timeline visibility

## Validated Decisions

### Database Remains Source Of Truth

`ToolInvocation` records are created before RabbitMQ messages are published. Workers must claim invocations from Postgres before execution. This prevents duplicate RabbitMQ delivery from causing duplicate tool side effects.

### Business API Does Not Execute Tools

The Business API records founder decisions and dispatches execution messages. Tool execution remains isolated in `services/workers`.

### RabbitMQ Is A Wake-Up Transport

RabbitMQ messages carry execution hints. If RabbitMQ is unavailable, pending database invocations remain recoverable by a polling worker or replay process.

### Retries Have A Polling Path

Retries are scheduled with `nextAttemptAt` on `ToolInvocation`. The worker polling loop claims due pending invocations, which avoids relying on RabbitMQ delayed-message plugins.

### Retry State Is Durable

Retry count, maximum retries, and next-attempt time live on `ToolInvocation`. The worker can crash and resume without losing retry state.

### Founder Visibility Exists

The web execution timeline reads command and invocation state. Pending retries expose `nextAttemptAt`, retry count, and status.

## Gaps Found

### G1: Database Migrations Are Not Yet Formalized

The Prisma schema is updated, but the repo still needs a disciplined migration workflow with generated migration files and migration validation in CI.

Priority: High

### G2: Real MCP Adapter Registry Is Still Missing

The worker has an executor interface and no-op executor, but no provider adapters or capability-to-adapter registry.

Priority: High

### G3: Retry Safety Must Be Adapter-Owned

The worker can schedule retries, but provider adapters must declare whether an operation is retry-safe. Destructive side effects must not be retried unless the adapter provides idempotency guarantees.

Priority: High

### G4: Outbox Replay Is Not Implemented

If RabbitMQ publishing fails, pending invocations remain in the database and the polling worker can process them. There is not yet a replay publisher that republishes old pending invocations for RabbitMQ-only deployments.

Priority: Medium

### G5: Runtime Integration Tests Are Missing

Current checks validate compile, lint, build, and schema validity. They do not yet spin up Postgres and RabbitMQ to test approval-to-worker flow end to end.

Priority: Medium

### G6: Observability Is Early

Structured logs exist, but metrics, tracing spans, and dashboards are not implemented yet.

Priority: Medium

### G7: Secrets And Payload Redaction Need A Shared Policy

Payloads are stored as JSON for auditability. Before real integrations, request and response payloads need a shared redaction layer.

Priority: High

## Recommended Next Work

1. Add Prisma migration discipline and CI migration validation.
2. Add MCP adapter registry with a typed mock provider.
3. Add runtime integration tests for approval, dispatch, worker claim, retry, and failure paths.
4. Add outbox replay publisher for pending invocations.
5. Add redaction utilities before storing real provider payloads.
