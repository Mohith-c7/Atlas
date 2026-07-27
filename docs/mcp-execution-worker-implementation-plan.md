# MCP Execution Worker Implementation Plan

## Purpose

The MCP execution worker turns approved founder intent into controlled, observable tool work. The worker must never be a hidden chatbot side effect engine. It is a separate execution boundary that consumes approved action records, invokes MCP adapters through stable interfaces, records every attempt, and leaves an auditable trail the founder can inspect.

## Product Boundary

FAIOS is a solo-founder AI assistant SaaS. The founder is the only human actor in the core product. The system still needs strict execution controls because MCP tools can send messages, update tasks, create issues, schedule meetings, and modify external startup systems.

This plan intentionally avoids team membership, organization tenancy, RBAC, and multi-user approval flows.

## Non-Goals

- No real third-party MCP provider credentials in this phase.
- No Slack, Gmail, Jira, GitHub, Notion, or calendar business logic.
- No authentication or membership system.
- No long-running workflow orchestration engine yet.
- No background execution inside the Business API process.

## Architectural Principles

- Business API records intent and decisions.
- Worker service performs execution.
- Database state is the source of truth for command, approval, and invocation lifecycle.
- MCP provider code is isolated behind adapter interfaces.
- Every external side effect requires an invocation record before execution.
- Retriable work must be idempotent or explicitly marked safe to retry.
- Execution status must be founder-visible and support debugging without exposing secrets.

## Execution Lifecycle

1. Founder submits a voice or chat command.
2. AI Orchestrator returns an execution plan.
3. Business API persists the command and plan.
4. Approval requests are created for risky steps.
5. Founder approves or rejects pending requests.
6. When all required approvals for a command are approved, the Business API creates pending tool invocations.
7. Worker claims pending invocations.
8. Worker marks the invocation running.
9. Worker invokes the MCP adapter boundary.
10. Worker records success, failure, cancellation, or retry metadata.
11. Command status is updated when all invocations reach a terminal state.

## Phase 1: Execution Foundation

### 1.1 Contracts

- Add `toolInvocationStatusSchema`.
- Add `toolInvocationSchema`.
- Add `executionJobSchema`.
- Add worker response contracts for future API/UI consumption.

### 1.2 Approval-To-Execution Enqueue

- When an approval is approved, inspect the command's remaining approvals.
- If all approvals are approved, create one `ToolInvocation` row per approved execution step.
- Use `ToolInvocation.status = PENDING` as the initial durable queue state.
- Update `Command.status = EXECUTING` once invocations are queued.
- If an approval is rejected, mark the command as `CANCELLED`.

### 1.3 Idempotency

- Approval decisions are idempotent.
- Invocation enqueueing must not duplicate rows if an approval endpoint is called repeatedly.
- Existing pending, running, succeeded, failed, or cancelled invocations for the command prevent duplicate enqueue.

### 1.4 Worker Claiming

- Worker finds pending invocations ordered by creation time.
- Worker claims one invocation transactionally by moving `PENDING -> RUNNING`.
- Worker claim must include command and founder context.
- Worker does not rely on in-memory state for correctness.

### 1.5 MCP Executor Boundary

- Define `McpToolExecutor` interface.
- Define `McpToolExecutionRequest`.
- Define `McpToolExecutionResult`.
- Provide `NoopMcpToolExecutor` for local scaffolding.
- No provider-specific implementation in this phase.

### 1.6 Completion Handling

- On success, store sanitized response payload and `completedAt`.
- On failure, store error code, sanitized message, and `completedAt`.
- Update command to `COMPLETED` when all invocations succeeded.
- Update command to `FAILED` when any invocation failed and no invocation is still running or pending.

## Phase 2: Queue Transport

- Introduce RabbitMQ publishing after enqueue.
- Keep database records as source of truth.
- Worker consumers should use queue messages as wake-up hints, not exclusive state.
- Messages must include invocation ID, command ID, founder ID, correlation ID, and schema version.

## Phase 3: Retry And Backoff

- Add retry policy metadata.
- Distinguish transient errors, provider errors, validation errors, and unsafe side-effect errors.
- Retry only when the adapter declares the operation retry-safe.
- Add exponential backoff with jitter.
- Add dead-letter handling for exhausted retries.

## Phase 4: Real MCP Adapters

- Implement adapter registry.
- Add provider-specific adapters behind capability names.
- Normalize provider responses.
- Redact secrets and access tokens from all logs and database payloads.
- Add capability health checks.

## Phase 5: Founder Execution Timeline

- Add Business API read endpoints for command execution state.
- Add web execution timeline below the command composer.
- Show step status, provider, start time, completion time, and safe summaries.
- Add WebSocket events later for live updates.

## Phase 6: Production Hardening

- Add metrics for claim latency, execution latency, retries, failures, and provider error rates.
- Add structured audit events.
- Add worker graceful shutdown.
- Add poison-job detection.
- Add database indexes for polling and command history.
- Add integration tests with a disposable PostgreSQL database.

## Data Ownership

- `Command` owns the founder request lifecycle.
- `ExecutionPlan` owns AI-planned steps.
- `ApprovalRequest` owns founder consent.
- `ToolInvocation` owns execution attempts and external side-effect records.
- Future `AuditEvent` records should provide immutable compliance history.

## Failure Policy

- Rejected approval cancels the command.
- Missing approval prevents enqueue.
- MCP adapter unavailable fails the invocation in the skeleton phase.
- Provider validation errors are non-retryable.
- Network/timeouts may become retryable only after adapter-level idempotency is defined.

## Phase 1 Acceptance Criteria

- Contracts compile and are shared across services.
- Approval approval can enqueue pending tool invocations exactly once.
- Rejection cancels the command.
- Worker has a claim/process loop boundary.
- No real MCP provider action is executed.
- Lint, typecheck, tests, build, and formatting pass.
