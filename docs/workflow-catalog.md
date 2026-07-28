# FAIOS Workflow Catalog

This catalog defines the founder-facing workflows exposed by the operating system.
It intentionally separates live workflows from planned workflows so product, engineering, and QA
can reason about readiness without guessing from UI copy.

## Status Model

- `live`: the workflow has a typed contract, backend catalog entry, planner coverage, adapter/runtime
  coverage where required, and automated tests.
- `planned`: the workflow is visible as roadmap context but cannot be executed yet.
- `ready`: the founder has connected the required provider capability.
- `not_connected`: the workflow is implemented, but the founder has not connected the provider.

## Live Workflows

| Workflow                           | Provider | Capability                   | Mode                | Approval     | Coverage                                                              |
| ---------------------------------- | -------- | ---------------------------- | ------------------- | ------------ | --------------------------------------------------------------------- |
| Create GitHub issue                | GitHub   | `repository.createIssue`     | `approval_required` | Required     | Planner, Business API, worker integration, provider payload redaction |
| Summarize GitHub repository status | GitHub   | `repository.summarizeStatus` | `automatic`         | Not required | Planner, Business API, worker integration, provider payload redaction |

## Planned Workflows

| Workflow                                      | Provider                             | Required capability direction                                 |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Find availability and schedule a meeting      | Google Calendar                      | OAuth, availability lookup, event creation, conflict handling |
| Summarize unread founder emails               | Gmail                                | OAuth, read-only message summaries, privacy-safe storage      |
| Draft and approve an email reply              | Gmail                                | Draft creation, approval gate, send execution                 |
| Summarize Slack channel context               | Slack                                | Channel history retrieval, summarization, source attribution  |
| Draft and approve a Slack update              | Slack                                | Draft creation, approval gate, post execution                 |
| Create a Notion planning page                 | Notion                               | Page creation, workspace/page selection, template support     |
| Create a Jira or ClickUp task                 | Jira/ClickUp                         | Project discovery, issue/task creation, approval gate         |
| Draft and approve a WhatsApp Business message | WhatsApp Business                    | Contact targeting, template rules, approval gate              |
| Use memory to personalize a follow-up         | FAIOS memory plus messaging provider | Memory retrieval, redaction, draft generation, approval gate  |

## Implementation Rules

- Every executable workflow must be represented in `WorkflowCatalog`.
- Every executable workflow must have a capability entry and MCP adapter ownership.
- Read-only workflows may run automatically after provider connection.
- Mutating workflows must require founder approval until an explicit product decision changes that.
- Provider responses must pass through redaction before persistence.
- Disconnected and unhealthy providers must fail with actionable, typed error codes.

## Validation Commands

- `pnpm --filter @faios/business-api test:integration`
- `pnpm --filter @faios/workers test:integration`
- `pnpm --dir services/ai-orchestrator test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
