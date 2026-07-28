# Release Promotion Checklist

## Pre-Merge

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Business API integration suite with Postgres/RabbitMQ.
- Worker integration suite with Postgres/RabbitMQ.
- AI orchestrator Ruff and pytest.
- Prisma validate and migration drift check.

## Image Build

- `pnpm docker:build`
- Push immutable tags for all runtime images.
- Record image digests in the release notes.

## Staging

- Deploy `infra/kubernetes/overlays/staging`.
- Run migration job.
- Run smoke checks.
- Review logs, metrics, and trace headers.
- Exercise one founder command against non-production provider credentials.

## Production

- Confirm backup freshness for Postgres and Qdrant.
- Confirm no open critical security advisories.
- Apply production manifests with immutable image tags.
- Run migration job before deployment rollout.
- Run production smoke checks.
- Watch SLO dashboards for at least 30 minutes.

## Post-Release

- Tag the release.
- Update changelog.
- Archive smoke output.
- Capture rollback notes even when no rollback was needed.
