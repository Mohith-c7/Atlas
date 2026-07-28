# Security, Privacy, And Compliance Runbook

This runbook defines the M16 baseline controls for the FAIOS Business API. It is intentionally scoped to the solo-founder SaaS model: one authenticated founder operates their own connected tools through approved AI/MCP workflows.

## Threat Model

### Assets

- Founder session tokens.
- Integration credentials and OAuth refresh tokens.
- Command prompts, execution plans, approval decisions, provider payloads, and provider responses.
- Founder memory records and vector metadata.
- Billing state and webhook events.

### Primary Trust Boundaries

- Browser to Business API.
- Business API to PostgreSQL.
- Business API to RabbitMQ.
- Business API and workers to external providers.
- Business API and workers to Qdrant.
- Stripe webhook sender to Business API.

### High-Risk Failure Modes

- Cross-origin browser calls from an untrusted web origin.
- Command spam or automated abuse that triggers expensive AI/MCP workflows.
- Leaking credentials or provider payloads into access logs.
- Persisting raw secrets in memory, approvals, invocations, or execution responses.
- Replay or spoofing of external webhooks.
- Lost or stale encryption keys without a tested rotation path.
- Founder data retained longer than product or legal policy allows.

## API Edge Controls

- CORS is deny-by-default in production unless origins are configured through `CORS_ALLOWED_ORIGINS`, `WEB_ORIGIN`, or `PUBLIC_WEB_URL`.
- API security headers are applied to every response:
  - `Content-Security-Policy`
  - `Strict-Transport-Security` in production
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- Rate limiting is enabled by default with founder-aware keys when a founder session is available and IP fallback for public traffic.
- `POST /api/v1/commands` has a stricter command-abuse policy because it can trigger AI planning and downstream provider work.
- Access logs are emitted by the FAIOS plugin with redacted headers and no raw request body logging.

## Environment Controls

| Variable                                       | Purpose                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CORS_ALLOWED_ORIGINS`                         | Comma-separated allowed browser origins. Required for production unless `WEB_ORIGIN` or `PUBLIC_WEB_URL` is set. |
| `BUSINESS_API_RATE_LIMIT_ENABLED`              | Enables API rate limiting. Defaults to `true`.                                                                   |
| `BUSINESS_API_RATE_LIMIT_WINDOW_MS`            | Default route rate-limit window.                                                                                 |
| `BUSINESS_API_RATE_LIMIT_MAX_REQUESTS`         | Default max requests per route window.                                                                           |
| `BUSINESS_API_COMMAND_RATE_LIMIT_WINDOW_MS`    | Command-specific abuse-control window.                                                                           |
| `BUSINESS_API_COMMAND_RATE_LIMIT_MAX_REQUESTS` | Command-specific max requests per window.                                                                        |

## Secret Rotation Plan

1. Create a new 32-byte base64 `FAIOS_ENCRYPTION_KEY` and increment `FAIOS_ENCRYPTION_KEY_VERSION`.
2. Deploy code that can read both old and new key versions before writing new credentials with the new version.
3. Run a credential re-encryption job that reads each encrypted credential, decrypts with its stored key version, and rewrites with the new key version.
4. Verify all active integration credentials have the new key version.
5. Remove the old key from runtime secret stores only after verification and rollback window expiry.
6. Record the rotation in the security change log with operator, time, affected environments, and verification evidence.

## Data Retention Policy

- Founder memory deletion is soft-delete first, with purge controlled by retention metadata.
- Archived memory is hidden from active retrieval and vector sync.
- Provider request and response payloads must be redacted before persistence.
- Exported founder data must be generated from redacted application models, not raw credential or provider secret stores.
- Full-founder deletion remains incomplete until account-wide deletion covers sessions, integrations, commands, approvals, billing references, memory, and vector records.

## Privacy Implementation Checklist

- Publish categories of data collected: account profile, command text, memory, integrations, approvals, execution metadata, and billing metadata.
- Document subprocessors: AI model providers, hosting, database, queue, vector database, email/calendar/tool providers, and payments.
- Document retention windows for command history, approval records, memory, sessions, billing events, and credentials.
- Document founder export and deletion request handling.
- Document that connected provider secrets are encrypted and never displayed after initial submission.
- Document that AI/MCP execution logs are redacted and may include metadata required for debugging.

## Incident Response

1. Triage severity: credential exposure, cross-founder access, provider-side destructive action, billing issue, or availability incident.
2. Freeze risky execution paths by disabling provider workers or command dispatch flags when needed.
3. Preserve logs and correlation IDs without copying raw payloads into incident notes.
4. Rotate affected secrets, revoke provider tokens, and invalidate founder sessions when credential exposure is possible.
5. Identify affected founders and records through audit-safe metadata.
6. Patch, validate, and deploy with targeted regression tests.
7. Produce a post-incident review with root cause, blast radius, remediation, and prevention work.

## Verification

- Run `pnpm --filter @faios/security lint`.
- Run `pnpm --filter @faios/security typecheck`.
- Run `pnpm --filter @faios/business-api lint`.
- Run `pnpm --filter @faios/business-api typecheck`.
- Run `pnpm --filter @faios/business-api build`.
- Run `pnpm --filter @faios/business-api exec tsx src/integration/security-boundary.integration.ts`.

## Audit Ledger

Sensitive founder actions are persisted to `AuditEvent` with founder id, action, actor type,
resource identity, correlation id, IP address, user agent, and redacted metadata. Current audit
coverage includes account updates, approval decisions, integration connection/credential lifecycle
actions, and memory import/update/delete/archive/merge/retention purge flows.

Audit metadata must pass through the shared redaction helpers before persistence. Do not store raw
provider payloads, tokens, cookies, API keys, or command payloads in audit metadata.
