# FAIOS Backup, Restore, And Continuity Plan

This plan defines launch-grade backup and restore expectations for stateful FAIOS dependencies.

## PostgreSQL

Backup policy:

- Enable managed point-in-time recovery with at least 7 days retention for staging and 30 days for production.
- Take daily logical backups for founder-critical tables.
- Store backups in a separate encrypted storage account or bucket.
- Test restore monthly before launch and after schema-heavy milestones.

Restore drill:

1. Create an isolated restore database.
2. Restore to the selected timestamp.
3. Run Prisma migrations in deploy mode if restoring into a newer release candidate.
4. Run read-only data checks:
   - founder account count
   - command count
   - execution count
   - memory item count
   - failed durable job count
5. Point a staging Business API instance at the restored database.
6. Verify `/health/ready`.
7. Run smoke tests against founder-scoped read endpoints.
8. Document restore timestamp, duration, row counts, and validation result.

## Qdrant

Backup policy:

- Enable collection snapshots for the memory collection.
- Keep Qdrant snapshots aligned with PostgreSQL PITR windows.
- Store snapshots outside the Qdrant node volume.

Restore drill:

1. Restore PostgreSQL first.
2. Restore the Qdrant collection snapshot closest to the database restore timestamp.
3. Run memory semantic search smoke tests.
4. Replay memory vector jobs for founders with stale or missing `vectorRef` values.
5. Confirm queue depth returns to zero.

## Redis

Persistence policy:

- Use managed Redis with AOF or provider-equivalent durable persistence in production.
- Treat Redis as recoverable cache/session-adjacent state unless a future milestone stores durable workflow state there.
- Keep eviction policy explicit and documented per environment.

## RabbitMQ

Continuity policy:

- Use durable queues and persistent messages for execution and memory-vector jobs.
- Keep dead-letter queues separate from primary queues.
- Monitor queue depth and dead-letter growth.
- Recovery relies on durable database job state first, RabbitMQ second.

## AWS S3

Backup policy:

- Enable versioning for founder file/object buckets.
- Enable lifecycle rules for old versions after retention policy is finalized.
- Use server-side encryption.

## Disaster Recovery Targets

Initial launch targets:

- RPO: 15 minutes for PostgreSQL.
- RTO: 4 hours for PostgreSQL restore.
- RPO: 24 hours for Qdrant snapshots, with replay to rebuild missing vectors.
- RTO: 8 hours for full memory semantic restore.

These targets should tighten after production traffic and cost profiles are known.
