# Engineering Conventions

## Naming

- Monorepo packages use the `@faios/*` scope.
- Feature folders use kebab-case.
- TypeScript files use kebab-case except React components, which use PascalCase.
- Environment variables use uppercase snake case.
- Event names use past-tense domain facts such as `workflow.completed`.
- Product language should use `founder`, `command`, `integration`, `memory`, and `MCP capability` instead of workspace/team terminology unless a later product phase explicitly introduces it.

## Feature Layout

```text
features/<feature-name>/
  application/      Use cases and orchestration
  domain/           Entities, value objects, and domain services
  infrastructure/   Database, queues, external adapters
  presentation/     UI or transport adapters
  index.ts          Public feature exports
```

## Coding Standards

- Prefer explicit types on public package exports.
- Keep side effects at application edges.
- Validate inputs at boundaries before passing them into domain code.
- Use dependency injection for external services.
- Keep vendor-specific code out of domain and planner contracts.
- Treat retries and idempotency as part of the design, not an afterthought.

## Testing Strategy

- Unit tests for pure domain and contract utilities.
- Integration tests for repositories, queues, and provider adapters.
- Contract tests for public APIs, internal service calls, events, and MCP capabilities.
- End-to-end tests for founder journeys only after feature implementation begins.
