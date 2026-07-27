# Founder AI Operating System

Founder AI Operating System (FAIOS) is an AI-native, voice-first solo-founder SaaS for operating startup tools through natural language. The repository now contains the production foundation plus the first vertical runtime: command planning, founder-scoped memory, GitHub connection/execution, approval gating, worker execution, realtime updates, health checks, and voice-command capture.

## Monorepo Layout

```text
apps/
  web/                  Next.js 15 founder console
  mobile/               React Native placeholder for future app
services/
  business-api/         Node.js + Fastify service shell
  ai-orchestrator/      FastAPI + LangGraph service shell
  workers/              Event and workflow worker shell
packages/
  contracts/            Versioned DTO and command contract surfaces
  database/             Prisma schema, migrations, and client boundary
  env/                  Typed environment loading boundary
  events/               Event names, envelopes, and messaging conventions
  logger/               Shared logging boundary
  mcp/                  Capability-first MCP abstractions
  types/                Cross-package TypeScript primitives
  ui/                   Shared design-system composition surface
tooling/
  eslint-config/        Shared ESLint flat configs
  prettier-config/      Shared formatting rules
  typescript-config/    Shared TypeScript compiler presets
docker/                 Service Dockerfiles
infra/                  Local Docker Compose and Kubernetes manifests
docs/                   Architecture decision records and conventions
```

## Architecture Principles

- AI-first: the AI orchestrator owns intent interpretation, planning, execution coordination, memory selection, and response synthesis.
- Voice-first: web and future mobile clients are organized around streaming conversation surfaces.
- Solo-founder SaaS: each founder owns one assistant profile, connected tools, memory, conversations, and execution history.
- API-first: external and internal contracts live in shared packages before implementation.
- Event-driven: cross-service state changes flow through durable events instead of direct temporal coupling.
- Capability-based MCP: AI plans against capabilities, while provider-specific details remain behind MCP adapters.
- Clean Architecture: domain contracts stay independent from frameworks, persistence, and transport.

## Dependency Direction

```text
apps/* and services/*
  -> packages/contracts
  -> packages/events
  -> packages/mcp
  -> packages/types
  -> packages/env
  -> packages/logger

packages/database is consumed by backend services only.
packages/ui is consumed by frontend apps only.
tooling/* is consumed by every TypeScript workspace.
```

Dependencies should point inward to stable abstractions. Feature code may depend on contracts, but contracts must not depend on feature implementations.

## Local Development

```bash
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @faios/database exec prisma migrate deploy --schema prisma/schema.prisma
pnpm dev
```

Infrastructure-only dependencies can be started with:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## CI Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @faios/business-api test:integration
pnpm test:integration:execution
pnpm smoke:github:e2e
python -m ruff check services/ai-orchestrator/src services/ai-orchestrator/tests
python -m pytest services/ai-orchestrator/tests
```

## Product Model

FAIOS is not a team collaboration suite. The founder is the primary operator. Other people may appear as contacts, assignees, invitees, or recipients inside connected tools, but they do not need FAIOS accounts in the MVP.

The system of record inside FAIOS is the founder's command lifecycle:

```text
Founder voice/text intent
  -> AI interpretation
  -> execution plan
  -> approval gate when needed
  -> MCP tool invocation
  -> result summary
  -> memory update
  -> execution history
```

## Implemented Foundation

- Next.js founder console with chat and browser voice-command capture
- Fastify business API with founder session boundary, command planning, approvals, integrations, SSE execution events, and health probes
- FastAPI AI orchestrator with LangGraph planning boundary, deterministic fallback planner, speech boundary, and health probes
- Worker runtime with RabbitMQ dispatch, retry handling, MCP adapter registry, encrypted credential resolution, and GitHub issue execution
- PostgreSQL/Prisma schema and migrations for founder profile, conversations, commands, approvals, integrations, credentials, invocations, and memory
- Shared contracts, security, events, logging, MCP, TypeScript, ESLint, Prettier, Docker, and Kubernetes foundations

## Still Deferred

- Production authentication and billing
- Real LLM provider configuration and prompt/model evaluation harness
- Provider OAuth UX completion pages and token refresh
- Full streaming transcription provider implementation
- More external tool adapters beyond GitHub issue creation
- Production-grade observability backend, dashboards, and alert policies
