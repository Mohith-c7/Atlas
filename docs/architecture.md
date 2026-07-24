# FAIOS Architecture

## System Boundary

FAIOS is split into independently deployable applications and services. The web app captures solo-founder intent through voice or chat. The business API owns founder account resources, connected-app state, and command-history surfaces. The AI orchestrator owns intent interpretation, planning, model routing, memory retrieval strategy, and MCP execution coordination. Workers consume durable events for asynchronous execution, notifications, retries, and long-running workflows.

## Service Boundaries

| Boundary                   | Runtime           | Responsibility                                                                                |
| -------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `apps/web`                 | Next.js 15        | Founder console, chat and voice surfaces, dashboards, settings shells                         |
| `services/business-api`    | Node.js + Fastify | Product-facing command/query API shell                                                        |
| `services/ai-orchestrator` | FastAPI           | AI planning, orchestration, memory selection, MCP execution coordination shell                |
| `services/workers`         | Node.js           | Event consumers, retry processors, workflow continuations                                     |
| `packages/mcp`             | TypeScript        | Capability contracts independent of Jira, Slack, Gmail, GitHub, Notion, and similar providers |
| `packages/events`          | TypeScript        | Event envelopes, event naming, idempotency, and founder command metadata                      |
| `packages/contracts`       | TypeScript        | Versioned DTO surfaces shared between clients and services                                    |

## Founder Ownership Model

Every request, event, memory lookup, object-storage access, and integration credential lookup must carry founder context. FAIOS is a solo-founder SaaS: one founder account owns one assistant profile, one company profile, connected integrations, conversation history, execution history, and memory.

The MVP does not include workspaces, memberships, invites, team RBAC, or organization hierarchies. People referenced by the founder are external contacts or tool-native users resolved through connected apps.

## Event Model

Events use a standard envelope:

- `eventId` for idempotency
- `eventType` for routing
- `founderId` for ownership
- `occurredAt` for ordering and audit
- `correlationId` for tracing workflows
- `payload` for versioned event data

RabbitMQ is the default queue because the MVP needs durable work queues, retries, and dead-letter routing. Kafka can be introduced later for high-volume analytics streams without changing domain events.

## MCP Model

The AI planner must never plan against vendor APIs directly. It plans against capabilities such as `task.create`, `communication.send`, `calendar.schedule`, `knowledge.search`, and `repository.createIssue`. Provider adapters translate these capabilities into Jira, Slack, Gmail, Google Calendar, WhatsApp Business, GitHub, Notion, or ClickUp calls.

## Command Lifecycle

```text
Founder intent
  -> conversation message
  -> AI command interpretation
  -> execution plan
  -> MCP capability selection
  -> approval request when required
  -> tool invocation
  -> execution event
  -> founder-facing summary
  -> memory update
```

## Clean Architecture Rules

1. Feature modules own their local application, domain, infrastructure, and presentation folders.
2. Framework code stays at the edges.
3. Shared packages expose contracts and primitives, not application behavior.
4. Database access is hidden behind repositories inside backend services.
5. External providers are accessed only through integration or MCP adapter boundaries.
6. Events are versioned and additive by default.

## Observability

All deployable units are expected to emit structured logs, traces, and metrics. OpenTelemetry should propagate `founderId`, `correlationId`, command identifiers, and workflow identifiers without leaking sensitive payload data.
