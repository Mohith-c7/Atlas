# Real Provider Adapter Implementation Plan

## Purpose

This phase turns the MCP execution foundation into a real provider-capable platform slice. The goal is to execute one carefully bounded external action through the same durable command, approval, invocation, worker, retry, credential, and redaction path that future providers will use.

The first provider adapter is GitHub issue creation for `repository.createIssue`.

## Product Slice

```text
Approved founder command
  -> ToolInvocation stored in Postgres
  -> Worker claims invocation
  -> Worker resolves encrypted GitHub credentials
  -> MCP registry resolves GitHub adapter
  -> GitHub adapter validates payload
  -> GitHub issue is created through provider API
  -> Redacted response is persisted
```

## Why GitHub First

- Useful for founders and product teams.
- Lower operational risk than email, calendar, or messaging.
- Clear idempotency and retry boundaries.
- Easy to validate with mocked provider transport.
- Establishes the adapter pattern for Jira, Slack, Gmail, Calendar, Notion, and ClickUp.

## Non-Goals

- No OAuth web flow.
- No authentication implementation.
- No provider marketplace UI.
- No broad provider coverage.
- No autonomous unapproved action.
- No secrets in logs, request payloads, or persisted responses.

## Architecture Decisions

### MCP Owns Adapter Contracts

`@faios/mcp` owns:

- provider adapter interface
- credential resolver interface
- GitHub adapter implementation
- provider request/credential schemas
- provider retry classification
- provider response redaction

The MCP package does not import Prisma or read environment variables.

### Workers Own Credential Resolution

`services/workers` owns database-backed credential resolution because workers run the execution boundary. It reads `IntegrationConnection`, decrypts `IntegrationCredential`, and passes typed runtime credentials into adapters.

### Provider Credentials Stay Encrypted At Rest

Credentials are stored in `IntegrationCredential.encryptedPayload` and decrypted only inside worker infrastructure. Decrypted values are never persisted or logged.

### Retry Safety Is Adapter-Owned

The GitHub adapter classifies failures:

- missing credentials: `never_retry`
- invalid payload: `never_retry`
- unauthorized or forbidden: `never_retry`
- GitHub validation failure: `never_retry`
- rate limit or 5xx: `retry_transient`
- network failure: `retry_transient`

Workers convert adapter retry safety into durable retry scheduling.

### Provider Transport Is Injectable

The GitHub adapter accepts a fetch-compatible transport. Production uses `globalThis.fetch`; tests use a fake transport. This keeps CI deterministic and avoids real provider calls.

## Implementation Order

1. Add shared MCP credential resolver contracts.
2. Add GitHub credential and issue payload schemas.
3. Implement the GitHub `repository.createIssue` adapter.
4. Update default MCP registry construction to accept resolver and optional adapter mode.
5. Add worker database credential resolver.
6. Wire worker runtime to use the database resolver.
7. Add integration coverage for encrypted credentials and mocked GitHub execution.
8. Run full quality gates.
9. Commit and push.

## Acceptance Criteria

- GitHub adapter is registered for `repository.createIssue`.
- Worker can resolve encrypted GitHub credentials by founder, provider, and capability.
- Missing credentials fail safely without retry.
- Provider 5xx and transport failures are retryable only because adapter marks them so.
- Stored response payload contains no access token or secret material.
- Existing mock execution integration still passes.
- Full monorepo lint, typecheck, test, and build pass.

## Future Extensions

1. Add OAuth/token exchange and credential rotation workflow.
2. Add idempotency keys for providers that support them.
3. Add provider health/readiness endpoint.
4. Add Gmail draft adapter behind approval.
5. Add Calendar scheduling adapter behind approval.
6. Add adapter observability metrics and traces.
