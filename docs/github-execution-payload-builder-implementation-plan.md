# GitHub Execution Payload Builder Implementation Plan

## Purpose

This phase makes GitHub issue execution real enough to produce useful provider payloads from founder intent. The previous provider slice could execute `repository.createIssue`, but approvals generated generic invocation metadata. The GitHub adapter needs a concrete issue payload: `title`, `body`, and optional `labels`.

## Product Slice

```text
Founder asks for a GitHub issue
  -> AI planner selects repository.createIssue
  -> Planner builds issue title/body/labels
  -> Business API stores plan and approval payload
  -> Founder approves
  -> ToolInvocation stores provider payload
  -> Worker executes GitHub adapter with the payload
```

## Non-Goals

- No LLM extraction yet.
- No GitHub project, milestone, assignee, or repository selection.
- No autonomous execution without approval.
- No OAuth.
- No provider-specific UI editor.

## Design Decisions

### Plan Steps Carry Optional Execution Payloads

`ExecutionStep.executionPayload` is optional and typed as unknown in the shared contract. Provider-specific schemas validate concrete shapes where needed.

### GitHub Payload Is Deterministic

The mock planner derives:

- `title` from the founder command
- `body` from the command and planning context
- `labels` from simple keywords such as bug, onboarding, docs, product, or integration

This remains deterministic until a real planning model is introduced.

### Approval Payload Mirrors Execution Payload

Approval records include the planned execution payload so the founder can approve the actual action being queued.

### Invocation Payload Uses Provider Payload First

When approval is accepted, the invocation request payload is `step.executionPayload` when present. Generic fallback metadata remains for older plans.

## Acceptance Criteria

- `repository.createIssue` plans include `executionPayload.title`.
- Approval records include the provider payload.
- Approved GitHub invocations store a GitHub issue payload accepted by the adapter.
- Legacy plans without `executionPayload` still enqueue safely.
- Full checks and integration tests pass.
