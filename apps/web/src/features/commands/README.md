# Commands Feature

Founder command composer for the first Founder Command Pipeline web slice.

This feature owns the browser-facing command submission UI, the `POST /api/v1/commands`
API helper, and the TanStack Query mutation hook. Authentication-aware request handling
is centralized in `src/lib/api-client.ts`; backend execution, contracts, database
persistence, and real MCP tool calls remain outside this web feature.
