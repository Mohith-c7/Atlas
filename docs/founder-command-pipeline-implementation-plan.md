# Founder Command Pipeline Implementation Plan

## Purpose

This plan defines the first real vertical slice for FAIOS: a solo founder submits a text command, the platform records it, asks the AI Orchestrator for a plan, stores the plan, and returns a useful response. Execution through real MCP tools remains disabled in this phase.

The goal is to prove the core product spine without prematurely building authentication, voice streaming, billing, or third-party integrations.

## Product Slice

```text
Founder text command
  -> Web app command composer
  -> Business API command endpoint
  -> Command persisted
  -> AI Orchestrator mock planning endpoint
  -> ExecutionPlan persisted
  -> Founder receives plan summary and next state
```

## Non-Goals

- No real MCP execution
- No OAuth provider setup
- No authentication implementation
- No billing
- No team, workspace, membership, or RBAC features
- No voice capture yet
- No autonomous action against external apps

## Success Criteria

- A founder can submit a text command from the web app.
- The Business API creates a `Conversation`, `Message`, `Command`, and `ExecutionPlan`.
- The AI Orchestrator returns a deterministic mock plan using the shared command contract.
- The UI displays command status, plan summary, and planned steps.
- All requests include a correlation ID.
- The system is observable through structured logs.
- Contracts, schema, lint, typecheck, and build all pass.

## Target Architecture

```mermaid
sequenceDiagram
  participant Founder
  participant Web as Next.js Web App
  participant API as Fastify Business API
  participant DB as PostgreSQL via Prisma
  participant AI as FastAPI AI Orchestrator

  Founder->>Web: Enters text command
  Web->>API: POST /api/v1/commands
  API->>API: Validate request and attach correlationId
  API->>DB: Create Conversation if missing
  API->>DB: Create Message
  API->>DB: Create Command(status=PLANNING)
  API->>AI: POST /internal/v1/commands/plan
  AI->>AI: Build mock execution plan
  AI-->>API: Plan summary and steps
  API->>DB: Create ExecutionPlan
  API->>DB: Update Command(status=COMPLETED or AWAITING_APPROVAL)
  API-->>Web: Command response
  Web-->>Founder: Render plan and command status
```

## Service Responsibilities

### Web App

Location: `apps/web`

Responsibilities:

- Provide a small command composer UI.
- Send typed command requests to the Business API.
- Display command status, plan summary, and steps.
- Use TanStack Query for command mutation state.
- Keep UI state local and simple; do not introduce global Zustand state unless multiple surfaces need it.

Expected folders:

```text
apps/web/src/features/commands/
  api/
  components/
  hooks/
  types/
  README.md
```

### Business API

Location: `services/business-api`

Responsibilities:

- Own the product-facing command endpoint.
- Validate inbound requests using shared schemas from `@faios/contracts`.
- Attach or generate `correlationId`.
- Resolve a development founder ID until authentication exists.
- Persist command lifecycle records.
- Call the AI Orchestrator through an internal client.
- Return a typed response to the web app.

Expected folders:

```text
services/business-api/src/features/commands/
  application/
    create-command.use-case.ts
  domain/
    command-status.ts
  infrastructure/
    command.repository.ts
    ai-orchestrator.client.ts
  presentation/
    command.routes.ts
  index.ts
```

### AI Orchestrator

Location: `services/ai-orchestrator`

Responsibilities:

- Expose an internal planning endpoint.
- Accept the command planning request.
- Return a deterministic mock `ExecutionPlan`.
- Keep planning provider-agnostic.
- Avoid model calls in this phase.

Expected folders:

```text
services/ai-orchestrator/src/faios_ai_orchestrator/features/commands/
  planning.py
  schemas.py
  router.py
```

### Database Package

Location: `packages/database`

Responsibilities:

- Generate Prisma client.
- Export a database client factory.
- Keep direct Prisma usage inside backend infrastructure layers.

Expected additions:

```text
packages/database/src/
  client.ts
  index.ts
```

## Contracts

Location: `packages/contracts`

The command pipeline should define shared schemas for:

- command create request
- command create response
- planner request
- planner response
- execution step
- command status
- API error envelope

Contract rules:

- Use Zod as the runtime source of truth.
- Export inferred TypeScript types from Zod schemas.
- Keep request/response contracts additive and versionable.
- Do not import service implementation code into contracts.

Recommended response shape:

```ts
type CreateCommandResponse = {
  commandId: string;
  conversationId: string;
  status: "completed" | "awaiting_approval" | "failed";
  summary: string;
  steps: Array<{
    capability: string;
    provider?: string;
    requiresApproval: boolean;
    reason: string;
  }>;
  correlationId: string;
};
```

## Persistence Design

Use the existing Prisma schema objects:

- `FounderAccount`
- `Conversation`
- `Message`
- `Command`
- `ExecutionPlan`

Development founder handling:

- Add a deterministic local founder seed path or `DEV_FOUNDER_ID`.
- Do not pretend this is production auth.
- Keep the founder resolution behind a small boundary so auth can replace it later.

Transaction boundary:

1. Create conversation/message/command in a transaction.
2. Call AI Orchestrator outside the transaction.
3. Store plan and update command status in a second transaction.

Reason:

- Avoid holding database transactions across network calls.
- Keep partial failures recoverable.
- Allow future retry jobs to pick up `PLANNING` or `FAILED` commands.

## API Design

Public development endpoint:

```http
POST /api/v1/commands
```

Request:

```json
{
  "input": "Schedule a customer call next week and draft a follow-up email",
  "conversationId": "optional-existing-conversation-id",
  "source": "chat"
}
```

Response:

```json
{
  "commandId": "cmd_...",
  "conversationId": "conv_...",
  "status": "completed",
  "summary": "I prepared a plan to schedule the call and draft the follow-up.",
  "steps": [
    {
      "capability": "calendar.schedule",
      "provider": "google-calendar",
      "requiresApproval": true,
      "reason": "Scheduling a meeting changes the founder's calendar."
    },
    {
      "capability": "communication.send",
      "provider": "gmail",
      "requiresApproval": true,
      "reason": "Sending email externally requires founder approval."
    }
  ],
  "correlationId": "corr_..."
}
```

Internal AI endpoint:

```http
POST /internal/v1/commands/plan
```

This endpoint is internal-only by convention in this phase. Network-level enforcement can be added during deployment hardening.

## Error Handling

Use a standard error envelope:

```json
{
  "code": "COMMAND_PLANNING_FAILED",
  "message": "Unable to create a plan for this command.",
  "correlationId": "corr_...",
  "details": {}
}
```

Required error codes:

- `VALIDATION_ERROR`
- `FOUNDER_NOT_FOUND`
- `COMMAND_CREATE_FAILED`
- `AI_ORCHESTRATOR_UNAVAILABLE`
- `COMMAND_PLANNING_FAILED`
- `DATABASE_ERROR`
- `INTERNAL_SERVER_ERROR`

Command failure policy:

- If command persistence fails, return an error and create no command.
- If AI planning fails after command creation, update command to `FAILED`.
- If plan persistence fails, update command to `FAILED` when possible.
- Never return raw database or provider errors to the client.

## Performance Standards

Initial target:

- p95 command request latency under 1.5 seconds with mock planner.
- API validation and persistence under 150 ms locally.
- AI mock planner under 100 ms locally.
- Web command submission should show immediate pending state.

Design for later:

- Real model planning will move long-running execution to async workers.
- Tool execution should not block the initial command response once real MCP actions are introduced.
- Use status polling or WebSockets for long-running workflows.

## Reliability Standards

- Generate a correlation ID at the API edge if one is missing.
- Persist command status transitions.
- Keep network calls outside DB transactions.
- Make the planner response idempotency-friendly by linking to `commandId`.
- Future retries should operate on stored command state, not client resubmission.

## Security Standards

Even without auth implementation:

- Do not expose internal AI endpoints through the web app.
- Do not store secrets in command payloads.
- Do not log raw sensitive command content at error level.
- Do not execute external MCP tools in this phase.
- Treat approval-required steps as planned-only, never executed.
- Keep founder resolution isolated behind a replaceable development boundary.

## Observability Standards

Every command request should log:

- `service`
- `correlationId`
- `founderId`
- `commandId` when available
- `conversationId` when available
- status transition
- planner duration
- database duration where practical

Avoid logging:

- OAuth tokens
- email bodies
- full raw voice transcripts
- external contact details unless explicitly needed for debugging and redacted

## Testing Plan

### Unit Tests

- Contract schema validation
- Command use case status mapping
- AI client error mapping
- Repository input mapping

### Integration Tests

- `POST /api/v1/commands` creates the expected records.
- AI planner unavailable marks command as `FAILED`.
- Existing `conversationId` appends a message instead of creating a new conversation.
- Invalid request returns `VALIDATION_ERROR`.

### Build-Time Checks

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Prisma validation:

```bash
DATABASE_URL="postgresql://faios:faios@localhost:5432/faios?schema=public" \
  pnpm --filter @faios/database exec prisma validate --schema prisma/schema.prisma
```

## Implementation Order

1. **Contracts**
   Add command request/response and planner schemas to `@faios/contracts`.

2. **Database Client**
   Add Prisma client generation and a shared client factory in `@faios/database`.

3. **Business API Foundations**
   Add request correlation middleware, error envelope helper, and development founder resolver.

4. **Command Repository**
   Add repository methods for conversation, message, command, plan, and status updates.

5. **AI Orchestrator Mock Planner**
   Add `POST /internal/v1/commands/plan` returning deterministic steps from input.

6. **Command Use Case**
   Implement `createCommand` orchestration in the Business API.

7. **Command Route**
   Add `POST /api/v1/commands` and wire validation, use case, and response mapping.

8. **Web Command Composer**
   Add a minimal command composer UI using TanStack Query.

9. **Verification**
   Run Prisma validation and monorepo checks.

10. **Documentation**
    Update architecture docs with the implemented flow and known limitations.

## Deployment Notes

Local development should use:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis rabbitmq qdrant minio
pnpm --filter @faios/business-api dev
python -m uvicorn faios_ai_orchestrator.main:app --reload --app-dir services/ai-orchestrator/src
pnpm --filter @faios/web dev
```

The first slice can run with one static development founder. Production authentication and identity can replace the founder resolver without changing command pipeline ownership.

## Future Extension Points

After this slice is stable:

1. Add voice capture and speech-to-text.
2. Add MCP capability registry reads during planning.
3. Add approval request UI.
4. Add real MCP invocation for one sandbox integration.
5. Add WebSocket updates for long-running execution.
6. Add memory write/read during planning.
7. Add real authentication and subscription boundaries.

## Acceptance Checklist

- [ ] Contracts added and exported.
- [ ] Prisma client generated and database package exports client boundary.
- [ ] Business API command route exists.
- [ ] AI Orchestrator planning endpoint exists.
- [ ] Command records persist correctly.
- [ ] Execution plan records persist correctly.
- [ ] Web command composer submits and renders result.
- [ ] Errors use standard envelope.
- [ ] Correlation IDs appear in logs and responses.
- [ ] No real MCP execution happens.
- [ ] No team/workspace/membership concepts are introduced.
- [ ] Checks pass.
