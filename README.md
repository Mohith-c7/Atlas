# Founder AI Operating System

Founder AI Operating System (FAIOS) is an AI-native, voice-first, multi-tenant SaaS platform for operating a startup through natural language. This repository is a production architecture scaffold only: it establishes boundaries, tooling, conventions, and deployment foundations without implementing business features, authentication, or APIs.

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
  contracts/            Versioned DTO and event contract surfaces
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
- Multi-tenant SaaS: every service boundary must accept tenant context and enforce isolation before touching data or external tools.
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
```

## Current Scope

This scaffold intentionally does not include:

- Authentication implementation
- Business API routes
- AI workflow implementation
- Database entity models
- Third-party integration implementation

Those belong in later feature increments after contracts, threat model, tenancy model, and service ownership are approved.
