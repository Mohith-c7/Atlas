# Commands Feature

Founder command composer for the first Founder Command Pipeline web slice.

This feature owns the browser-facing command submission UI, the `POST /api/v1/commands`
API helper, and the TanStack Query mutation hook. Backend execution, contracts,
database persistence, authentication, and real MCP tool calls are intentionally outside
this web-only slice.
