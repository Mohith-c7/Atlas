# FAIOS 50 Percent Development Acceleration Plan

## Current State

FAIOS has a strong platform spine: command planning, MCP capability registry, approvals, RabbitMQ dispatch, worker execution, retries, redaction, encrypted credentials, GitHub setup, a GitHub adapter, and GitHub issue payload building.

Estimated completion:

- Platform foundation: 20-25%
- Payable SaaS product: 10-15%

## Target State For 50%

FAIOS reaches roughly 50% when a solo founder can reliably use one complete production-shaped workflow and the platform has the core infrastructure needed to add more providers quickly.

The 50% target is not “all integrations complete.” It is:

- one real workflow end-to-end
- secure identity boundary started
- provider setup and execution pattern proven
- AI planning boundary ready for real LLM/LangGraph
- memory foundation started
- voice/realtime path planned and scaffolded
- CI validates the core runtime

## Milestones

### M1: End-To-End GitHub Workflow

Goal: prove the whole operating-system spine with deterministic local smoke coverage.

Deliverables:

- local E2E smoke harness
- fake GitHub provider server
- real AI planner call
- real credential setup
- real approval
- real RabbitMQ dispatch
- real worker execution
- persisted successful invocation with issue URL

Completion impact: +6%

### M2: Founder Identity Boundary

Goal: replace the development founder shortcut with a production-shaped identity boundary without overbuilding teams or memberships.

Deliverables:

- `FounderSession` abstraction
- API key or signed dev session middleware
- founder-scoped repositories
- audit-safe request context
- auth-ready web client boundary

Completion impact: +7%

### M3: GitHub OAuth And Health

Goal: replace manual token entry with a real provider connection pattern.

Deliverables:

- OAuth state model
- callback route
- encrypted token storage
- token expiry metadata
- provider readiness endpoint
- credential rotation path

Completion impact: +7%

### M4: LangGraph Planner Foundation

Goal: move from deterministic mock planning to a real AI planning engine with provider-safe structured output.

Deliverables:

- model provider interface
- LangGraph planning graph
- structured planner output validation
- capability-aware planning
- approval policy node
- fallback deterministic planner

Completion impact: +8%

### M5: Organizational Memory Foundation

Goal: make the assistant remember useful founder/company facts.

Deliverables:

- memory repository
- Qdrant vector write/read adapter
- memory extraction from commands
- memory context injection into planner
- redaction policy for memory writes

Completion impact: +7%

### M6: Realtime Execution Feedback

Goal: show founders what the OS is doing while it runs.

Deliverables:

- WebSocket/SSE event channel
- command status stream
- invocation updates
- retry/failure notifications
- UI timeline auto-refresh replacement

Completion impact: +5%

### M7: Voice Input Foundation

Goal: start the voice-first product experience.

Deliverables:

- browser voice capture surface
- audio upload/stream contract
- speech service boundary
- transcript command handoff
- voice status UI

Completion impact: +5%

### M8: Observability And Operations

Goal: make the platform operable as a SaaS.

Deliverables:

- structured audit events
- metrics contract
- tracing correlation propagation
- health/readiness endpoints
- production env examples
- deployment smoke checklist

Completion impact: +5%

## Execution Order

1. M1 local E2E GitHub smoke
2. M2 founder identity boundary
3. M3 GitHub OAuth and health
4. M4 LangGraph planner foundation
5. M5 memory foundation
6. M6 realtime execution feedback
7. M7 voice input foundation
8. M8 observability and operations

## Commit Policy

Each completed implementation slice must:

- have an implementation plan or doc update
- include focused integration coverage when runtime behavior changes
- pass formatting, lint, typecheck, tests, build
- be committed and pushed before starting the next slice

## 50 Percent Acceptance Checklist

- [x] GitHub command runs end-to-end through local smoke.
- [x] Founder identity boundary exists.
- [x] GitHub OAuth foundation replaces manual token setup as the production path.
- [x] LangGraph planner foundation exists.
- [x] Memory write/read foundation exists.
- [x] Realtime execution updates exist.
- [x] Voice input foundation exists.
- [x] Observability and readiness endpoints exist.
- [x] CI validates critical runtime paths.
