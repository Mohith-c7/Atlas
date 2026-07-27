# Integration Credential Vault Implementation Plan

## Purpose

Real MCP adapters require provider credentials, OAuth tokens, refresh tokens, account metadata, and expiry information. This phase creates the credential storage foundation before any real provider adapter is implemented.

## Principles

- Never store provider secrets in plain JSON.
- Keep credential storage separate from provider execution logic.
- Store metadata needed for routing separately from encrypted secret material.
- Make encryption key rotation possible from the first version.
- Do not expose decrypted credentials to UI or logs.
- Keep payload redaction active at every execution boundary.

## Phase 1: Vault Foundation

- Add a shared security package.
- Provide AES-256-GCM JSON encryption and decryption.
- Require 32-byte base64 encryption keys.
- Include key version in encrypted payloads.
- Add database model for encrypted integration credentials.
- Link credentials to `IntegrationConnection`.
- Add migration and CI drift validation.

## Phase 2: Business API Repository

- Add repository methods to store, rotate, and read encrypted credentials.
- Decryption should only happen in infrastructure code.
- Application use cases should receive typed provider credential objects, not raw database rows.

## Phase 3: Provider Adapter Injection

- MCP adapters request credentials through a credential resolver interface.
- Adapter registry receives resolvers through dependency injection.
- Mock adapters remain credential-free.

## Phase 4: Operational Hardening

- Add key rotation workflow.
- Add credential expiry tracking.
- Add audit events for credential writes and rotations.
- Add provider health checks using encrypted credentials.

## Non-Goals

- No OAuth web flow yet.
- No auth or membership system.
- No real provider token exchange yet.
- No UI for connecting integrations yet.
