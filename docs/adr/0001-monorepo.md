# ADR 0001: Monorepo Architecture

## Status

Accepted

## Decision

Use a pnpm and Turborepo monorepo with deployable applications under `apps/`, deployable services under `services/`, shared runtime packages under `packages/`, and shared development tooling under `tooling/`.

## Rationale

FAIOS has multiple runtimes but a shared contract surface. A monorepo keeps API contracts, event envelopes, MCP capabilities, UI primitives, and service shells versioned together. Turborepo gives deterministic task orchestration and remote-cache readiness. pnpm provides strict dependency boundaries and efficient installs.

## Consequences

Each package must declare its dependencies explicitly. Shared packages must remain small and stable. Service-specific implementation must not leak into shared packages.
