# FAIOS Architecture

## System Boundary

FAIOS is split into independently deployable applications and services. The web app captures founder intent through voice or chat. The business API owns SaaS product resources and workflow-facing command surfaces. The AI orchestrator owns intent interpretation, planning, model routing, memory retrieval strategy, and execution coordination. Workers consume durable events for asynchronous execution, notifications, retries, and long-running workflows.

## Service Boundaries

| Boundary                   | Runtime           | Responsibility                                                                                |
| -------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `apps/web`                 | Next.js 15        | Founder console, chat and voice surfaces, dashboards, settings shells                         |
| `services/business-api`    | Node.js + Fastify | Product-facing command/query API shell                                                        |
| `services/ai-orchestrator` | FastAPI           | AI planning, orchestration, memory selection, MCP execution coordination shell                |
| `services/workers`         | Node.js           | Event consumers, retry processors, workflow continuations                                     |
| `packages/mcp`             | TypeScript        | Capability contracts independent of Jira, Slack, Gmail, GitHub, Notion, and similar providers |
| `packages/events`          | TypeScript        | Event envelopes, event naming, idempotency and tenant metadata                                |
| `packages/contracts`       | TypeScript        | Versioned DTO surfaces shared between clients and services                                    |

## Tenancy Model

Every request, event, memory lookup, object-storage access, and integration credential lookup must carry tenant context. The baseline strategy is logical isolation in PostgreSQL with strict tenant filters, separate OAuth credentials per tenant, separate vector namespaces in Qdrant, and tenant-prefixed S3 object keys. Higher-tier physical isolation can be added behind the database package without changing product code.

## Event Model

Events use a standard envelope:

- `eventId` for idempotency
- `eventType` for routing
- `tenantId` for isolation
- `occurredAt` for ordering and audit
- `correlationId` for tracing workflows
- `payload` for versioned event data

RabbitMQ is the default queue because the MVP needs durable work queues, retries, and dead-letter routing. Kafka can be introduced later for high-volume analytics streams without changing domain events.

## MCP Model

The AI planner must never plan against vendor APIs directly. It plans against capabilities such as `task.create`, `communication.send`, `calendar.schedule`, `knowledge.search`, and `repository.createIssue`. Provider adapters translate these capabilities into Jira, Slack, Gmail, Google Calendar, WhatsApp Business, GitHub, Notion, or ClickUp calls.

## Clean Architecture Rules

1. Feature modules own their local application, domain, infrastructure, and presentation folders.
2. Framework code stays at the edges.
3. Shared packages expose contracts and primitives, not application behavior.
4. Database access is hidden behind repositories inside backend services.
5. External providers are accessed only through integration or MCP adapter boundaries.
6. Events are versioned and additive by default.

## Observability

All deployable units are expected to emit structured logs, traces, and metrics. OpenTelemetry should propagate `tenantId`, `correlationId`, and workflow identifiers without leaking sensitive payload data.
