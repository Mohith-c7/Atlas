# FAIOS SLOs, Dashboards, And Alerts

This document defines the initial M17 observability contract. Thresholds are launch defaults and should be tuned with production traffic.

## Service Level Objectives

| Area                               | SLO                                                                       | Measurement                                     |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Business API availability          | 99.9% monthly readiness success                                           | `/health/ready` returns `200`.                  |
| Founder command acceptance latency | 95% under 500 ms                                                          | Command creation endpoint latency.              |
| Approval action latency            | 95% under 500 ms                                                          | Approval approve/reject endpoint latency.       |
| Durable execution completion       | 99% of retryable executions complete or terminally fail within 15 minutes | Execution records and queue metrics.            |
| Memory vector freshness            | 99% of vector jobs complete within 10 minutes                             | `MemoryVectorJob` timestamps and queue metrics. |
| Metrics availability               | 99.9% scrape success                                                      | `/metrics` scrape status.                       |

## Business API Dashboard

Panels:

- Request rate by route and status.
- Error rate by route.
- P50/P95/P99 latency by route.
- Readiness status.
- Process RSS and heap usage.
- Active deployment version and pod count from Kubernetes metadata.

Initial metric names:

- `faios_http_requests_total`
- `faios_http_request_duration_ms_total`
- `faios_http_request_duration_samples_total`
- `faios_process_uptime_seconds`
- `faios_process_memory_rss_bytes`
- `faios_process_memory_heap_used_bytes`

## Worker Dashboard

Panels:

- Memory vector queue depth.
- Memory vector jobs by outcome.
- Memory vector retry scheduled count.
- Memory vector dead-letter count.
- Provider latency average.
- Processing latency average.
- Process RSS and heap usage.

Initial metric names:

- `faios_worker_memory_vector_queue_depth`
- `faios_worker_memory_vector_jobs_processed_total`
- `faios_worker_memory_vector_retry_scheduled_total`
- `faios_worker_memory_vector_dead_lettered_total`
- `faios_worker_memory_vector_provider_latency_ms_total`
- `faios_worker_memory_vector_provider_latency_samples_total`
- `faios_worker_memory_vector_processing_latency_ms_total`
- `faios_worker_memory_vector_processing_latency_samples_total`

## Alert Rules

| Alert                       | Condition                                                      | Severity               | First Action                                 |
| --------------------------- | -------------------------------------------------------------- | ---------------------- | -------------------------------------------- |
| Business API down           | `/health/ready` fails for 3 minutes                            | Page                   | Check Postgres and recent deploys.           |
| API high 5xx rate           | 5xx rate over 2% for 5 minutes                                 | Page                   | Inspect logs by route and correlation ID.    |
| API high latency            | P95 over 1.5 seconds for 10 minutes                            | Ticket/Page by traffic | Check database latency and provider calls.   |
| Memory vector queue buildup | Queue depth increases for 15 minutes                           | Ticket                 | Scale workers or inspect downstream latency. |
| Memory vector dead-letter   | Dead-letter count increases                                    | Page                   | Stop broad replay, inspect failed job IDs.   |
| Provider retry spike        | Retry scheduled count increases by more than 100 in 10 minutes | Ticket                 | Check provider status and rate limits.       |
| Worker memory pressure      | RSS over 80% limit for 10 minutes                              | Ticket                 | Inspect concurrency and payload sizes.       |

## Recording Rules

Average latency can be computed as:

```text
rate(faios_http_request_duration_ms_total[5m])
/
rate(faios_http_request_duration_samples_total[5m])
```

Average provider latency can be computed as:

```text
rate(faios_worker_memory_vector_provider_latency_ms_total[5m])
/
rate(faios_worker_memory_vector_provider_latency_samples_total[5m])
```
