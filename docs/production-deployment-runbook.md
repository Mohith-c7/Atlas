# Production Deployment Runbook

## Scope

This runbook covers the current Kubernetes-based deployment path for FAIOS web, Business API, AI
orchestrator, workers, and Prisma migrations.

## Required Inputs

- Immutable image tags for `faios/web`, `faios/business-api`, `faios/ai-orchestrator`, and `faios/workers`.
- Production secrets managed outside Git and mounted as `faios-secrets`.
- DNS for the web and API hosts.
- TLS issuer or pre-provisioned TLS secret.
- Postgres, RabbitMQ, Redis, Qdrant, and object storage endpoints.

## Deployment Order

1. Render manifests with `kubectl kustomize infra/kubernetes/overlays/production`.
2. Apply namespace, config, secret references, services, ingress, PDBs, and HPAs.
3. Apply the Prisma migration job and wait for successful completion.
4. Apply deployments.
5. Wait for rollout completion for web, Business API, AI orchestrator, and workers.
6. Run production smoke checks:

```bash
pnpm ops:smoke:production -- --web-url https://app.faios.example.com --api-url https://api.faios.example.com
```

## Rollback

Rollback uses Kubernetes deployment revisions and immutable image tags:

```bash
kubectl -n faios rollout undo deployment/faios-web
kubectl -n faios rollout undo deployment/faios-business-api
kubectl -n faios rollout undo deployment/faios-ai-orchestrator
kubectl -n faios rollout undo deployment/faios-workers
```

Do not roll back across a non-reversible database migration without an explicit data rollback plan.

## Secret Manager Plan

The base manifests expect a `faios-secrets` Kubernetes Secret but do not prescribe the backing
provider. Production should create it through External Secrets Operator, cloud-native secret sync,
or sealed secrets. Required secret keys are documented in `infra/kubernetes/base/secret.example.yaml`.

## Smoke Criteria

- Web root returns `200`.
- Business API `/health/ready` returns `200`.
- AI orchestrator `/health/ready` returns `200` when exposed to the smoke runner.
- API responses include `x-correlation-id` and `x-trace-id`.
- Worker metrics endpoint is scrapeable inside the cluster at `faios-workers:9101/metrics`.
