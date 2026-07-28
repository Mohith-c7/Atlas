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

function normalizeDurationMs(latencyMs: number): number {
  return Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
}
