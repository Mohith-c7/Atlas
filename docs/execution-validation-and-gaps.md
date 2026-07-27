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

## Gap Closure Status

### G1: Database Migrations Are Not Yet Formalized

Status: Closed

The repo now includes an initial Prisma migration, migration lock file, CI schema validation, and CI migration drift validation with a shadow database.

Priority: High

### G2: Real MCP Adapter Registry Is Still Missing

Status: Closed for platform foundation

`@faios/mcp` now owns a provider-aware adapter registry, mock adapters for current capabilities, and a worker executor that resolves adapters through the registry.

Priority: High

### G3: Retry Safety Must Be Adapter-Owned

Status: Closed for platform foundation

MCP adapter results now carry retry safety. The worker converts adapter retry safety into retry decisions and does not infer retryability by itself.

Priority: High

### G4: Outbox Replay Is Not Implemented

Status: Partially closed

Pending invocations remain recoverable through the worker polling loop even if RabbitMQ publishing fails. A dedicated RabbitMQ replay publisher is still optional future work for RabbitMQ-only deployments.

Priority: Medium

### G5: Runtime Integration Tests Are Missing

Status: Closed

CI now includes an execution integration job with Postgres and RabbitMQ. The local runtime test validates migration deploy, dispatch message delivery, worker claim, mock adapter execution, and command completion.

Priority: Medium

### G6: Observability Is Early

Structured logs exist, but metrics, tracing spans, and dashboards are not implemented yet.

Priority: Medium

### G7: Secrets And Payload Redaction Need A Shared Policy

Status: Closed for platform foundation

`@faios/mcp` now provides shared recursive payload redaction. Business API redacts invocation request payloads before persistence, and the worker redacts request and response payloads at the adapter boundary.

Priority: High

## Recommended Next Work

1. Add the first real provider adapter behind the MCP registry.
2. Add encrypted integration credential storage before provider OAuth/token work.
3. Add provider health checks and readiness reporting from the adapter registry.
4. Add a replay publisher only if RabbitMQ-only execution mode becomes a requirement.
5. Add metrics and traces for queue latency, execution duration, retries, and failures.
