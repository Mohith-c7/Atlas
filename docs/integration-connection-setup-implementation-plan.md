# Integration Connection Setup Implementation Plan

## Purpose

This phase gives the founder a controlled way to connect the first real provider adapter without adding OAuth, authentication, teams, or membership concepts.

The first supported setup target is GitHub for `repository.createIssue`.

## Product Slice

```text
Founder enters GitHub connection details
  -> Web setup panel validates form state
  -> Business API validates request contract
  -> Development founder boundary resolves founder
  -> IntegrationConnection is upserted
  -> Credential payload is encrypted
  -> Redacted connection metadata is returned
```

## Non-Goals

- No OAuth authorization code flow.
- No production authentication.
- No membership, workspace, or RBAC.
- No GitHub API token verification during setup.
- No UI for every future provider.
- No decrypted credential response to the browser.

## Architecture Decisions

### Business API Owns Provider Setup

Provider setup is product-facing application behavior. It belongs in `services/business-api`, not the worker. Workers only consume already-stored credentials during execution.

### Contracts Own Runtime Validation

`@faios/contracts` owns request and response schemas so web and API share the same shape. Credentials are accepted only in create/update requests and never appear in response contracts.

### Credential Material Is Isolated

GitHub credential material is encrypted into `IntegrationCredential.encryptedPayload`. Non-secret routing metadata such as owner, repo, and API base URL is stored on `IntegrationConnection.metadata`.

### Development Founder Boundary Remains Replaceable

The setup flow uses the existing development founder resolver. Auth can replace this boundary later without changing the repository or provider adapter.

## Endpoints

```http
GET /api/v1/integrations/connections
POST /api/v1/integrations/github/connections
```

## Security Rules

- Access tokens are never returned by the API.
- Access tokens are never stored in metadata.
- API logs include connection IDs and providers, not token values.
- Encryption key is required before credential writes.
- Response payloads are safe for browser rendering.

## Acceptance Criteria

- Founder can create or update a GitHub integration connection.
- Founder can list redacted integration connections.
- GitHub connection includes `repository.createIssue`.
- Credential payload is encrypted at rest.
- Web UI can submit and refresh connection state.
- Full lint, typecheck, test, build, and integration execution checks pass.

## Next Phase

After this setup flow is stable, the next step is a GitHub execution payload builder so approval-generated invocations carry real issue title/body fields instead of generic plan summaries.
