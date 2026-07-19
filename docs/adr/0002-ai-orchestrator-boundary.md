# ADR 0002: AI Orchestrator Boundary

## Status

Accepted

## Decision

Implement the AI orchestrator as a separate FastAPI service instead of embedding AI workflows inside the business API.

## Rationale

AI orchestration has different scaling, latency, dependency, and observability needs from SaaS product APIs. Separating it allows independent model routing, LangGraph workflow execution, speech pipeline integration, memory retrieval, approval handling, and MCP execution coordination.

## Consequences

The business API remains the source of product resource authority. The AI orchestrator must call typed internal contracts and publish events rather than mutating product state through hidden paths.
