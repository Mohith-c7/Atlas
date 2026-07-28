export type MemoryVectorJobMetricOutcome = "succeeded" | "retry_scheduled" | "failed" | "skipped";

export type MemoryVectorJobMetricsSnapshot = {
  readonly processedTotal: number;
  readonly succeededTotal: number;
  readonly retryScheduledTotal: number;
  readonly failedTotal: number;
  readonly skippedTotal: number;
  readonly deadLetteredTotal: number;
  readonly providerLatencyMsTotal: number;
  readonly providerLatencySamples: number;
  readonly processingLatencyMsTotal: number;
  readonly processingLatencySamples: number;
  readonly retryCountTotal: number;
  readonly queueDepth: number | null;
};

export class MemoryVectorJobMetrics {
  private processedTotal = 0;
  private succeededTotal = 0;
  private retryScheduledTotal = 0;
  private failedTotal = 0;
  private skippedTotal = 0;
  private deadLetteredTotal = 0;
  private providerLatencyMsTotal = 0;
  private providerLatencySamples = 0;
  private processingLatencyMsTotal = 0;
  private processingLatencySamples = 0;
  private retryCountTotal = 0;
  private queueDepth: number | null = null;

  public recordProcessed(outcome: MemoryVectorJobMetricOutcome, latencyMs: number): void {
    this.processedTotal += 1;
    this.processingLatencyMsTotal += normalizeDurationMs(latencyMs);
    this.processingLatencySamples += 1;

    if (outcome === "succeeded") {
      this.succeededTotal += 1;
    } else if (outcome === "retry_scheduled") {
      this.retryScheduledTotal += 1;
      this.retryCountTotal += 1;
    } else if (outcome === "failed") {
      this.failedTotal += 1;
    } else {
      this.skippedTotal += 1;
    }
  }

  public recordProviderLatency(latencyMs: number): void {
    this.providerLatencyMsTotal += normalizeDurationMs(latencyMs);
    this.providerLatencySamples += 1;
  }

  public recordDeadLettered(): void {
    this.deadLetteredTotal += 1;
  }

  public setQueueDepth(queueDepth: number): void {
    this.queueDepth = Number.isInteger(queueDepth) && queueDepth >= 0 ? queueDepth : null;
  }

  public snapshot(): MemoryVectorJobMetricsSnapshot {
    return {
      processedTotal: this.processedTotal,
      succeededTotal: this.succeededTotal,
      retryScheduledTotal: this.retryScheduledTotal,
      failedTotal: this.failedTotal,
      skippedTotal: this.skippedTotal,
      deadLetteredTotal: this.deadLetteredTotal,
      providerLatencyMsTotal: this.providerLatencyMsTotal,
      providerLatencySamples: this.providerLatencySamples,
      processingLatencyMsTotal: this.processingLatencyMsTotal,
      processingLatencySamples: this.processingLatencySamples,
      retryCountTotal: this.retryCountTotal,
      queueDepth: this.queueDepth,
    };
  }
}

export function collectMemoryVectorJobMetrics(
  registry: {
    setGauge(name: string, help: string, labels: Record<string, string>, value: number): void;
  },
  metrics: MemoryVectorJobMetrics,
): void {
  const snapshot = metrics.snapshot();
  const labels = { runtime: "memory_vector" };

  registry.setGauge(
    "faios_worker_memory_vector_jobs_processed_total",
    "Total memory vector jobs processed by outcome.",
    { ...labels, outcome: "all" },
    snapshot.processedTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_jobs_processed_total",
    "Total memory vector jobs processed by outcome.",
    { ...labels, outcome: "succeeded" },
    snapshot.succeededTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_jobs_processed_total",
    "Total memory vector jobs processed by outcome.",
    { ...labels, outcome: "retry_scheduled" },
    snapshot.retryScheduledTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_jobs_processed_total",
    "Total memory vector jobs processed by outcome.",
    { ...labels, outcome: "failed" },
    snapshot.failedTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_jobs_processed_total",
    "Total memory vector jobs processed by outcome.",
    { ...labels, outcome: "skipped" },
    snapshot.skippedTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_dead_lettered_total",
    "Total memory vector RabbitMQ messages sent to the dead-letter path.",
    labels,
    snapshot.deadLetteredTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_retry_scheduled_total",
    "Total memory vector retries scheduled by the worker.",
    labels,
    snapshot.retryCountTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_provider_latency_ms_total",
    "Total memory vector provider latency in milliseconds.",
    labels,
    snapshot.providerLatencyMsTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_provider_latency_samples_total",
    "Total memory vector provider latency sample count.",
    labels,
    snapshot.providerLatencySamples,
  );
  registry.setGauge(
    "faios_worker_memory_vector_processing_latency_ms_total",
    "Total memory vector job processing latency in milliseconds.",
    labels,
    snapshot.processingLatencyMsTotal,
  );
  registry.setGauge(
    "faios_worker_memory_vector_processing_latency_samples_total",
    "Total memory vector job processing latency sample count.",
    labels,
    snapshot.processingLatencySamples,
  );

  if (snapshot.queueDepth !== null) {
    registry.setGauge(
      "faios_worker_memory_vector_queue_depth",
      "Last observed memory vector RabbitMQ queue depth.",
      labels,
      snapshot.queueDepth,
    );
  }
}

function normalizeDurationMs(latencyMs: number): number {
  return Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
}
