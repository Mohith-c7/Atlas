export type MetricType = "counter" | "gauge";

export type MetricLabelValue = string | number | boolean;

export type MetricLabels = Record<string, MetricLabelValue>;

export type MetricSample = {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  readonly labels: MetricLabels;
  readonly value: number;
};

type StoredMetric = {
  readonly help: string;
  readonly type: MetricType;
  readonly labels: MetricLabels;
  value: number;
};

export class MetricsRegistry {
  private readonly samples = new Map<string, StoredMetric>();

  public constructor(private readonly defaultLabels: MetricLabels = {}) {}

  public incrementCounter(name: string, help: string, labels: MetricLabels = {}, value = 1): void {
    const normalizedValue = normalizeMetricValue(value);

    if (normalizedValue < 0) {
      throw new Error(`Counter ${name} cannot be incremented by a negative value.`);
    }

    const metric = this.getOrCreateMetric(name, help, "counter", labels);
    metric.value += normalizedValue;
  }

  public setGauge(name: string, help: string, labels: MetricLabels = {}, value: number): void {
    const metric = this.getOrCreateMetric(name, help, "gauge", labels);
    metric.value = normalizeMetricValue(value);
  }

  public snapshot(): MetricSample[] {
    return [...this.samples.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, metric]) => ({
        name: key.split("{", 1)[0] ?? key,
        help: metric.help,
        type: metric.type,
        labels: metric.labels,
        value: metric.value,
      }));
  }

  private getOrCreateMetric(
    name: string,
    help: string,
    type: MetricType,
    labels: MetricLabels,
  ): StoredMetric {
    assertMetricName(name);
    const mergedLabels = normalizeLabels({ ...this.defaultLabels, ...labels });
    const key = createMetricKey(name, mergedLabels);
    const existingMetric = this.samples.get(key);

    if (existingMetric) {
      if (existingMetric.type !== type) {
        throw new Error(`Metric ${name} was already registered as ${existingMetric.type}.`);
      }

      return existingMetric;
    }

    const metric: StoredMetric = {
      help,
      type,
      labels: mergedLabels,
      value: 0,
    };
    this.samples.set(key, metric);
    return metric;
  }
}

export function collectNodeProcessMetrics(registry: MetricsRegistry): void {
  const memory = process.memoryUsage();

  registry.setGauge(
    "faios_process_uptime_seconds",
    "Process uptime in seconds.",
    {},
    process.uptime(),
  );
  registry.setGauge(
    "faios_process_memory_rss_bytes",
    "Resident set memory size in bytes.",
    {},
    memory.rss,
  );
  registry.setGauge(
    "faios_process_memory_heap_used_bytes",
    "Used V8 heap memory in bytes.",
    {},
    memory.heapUsed,
  );
}

export function renderPrometheusText(samples: readonly MetricSample[]): string {
  const metadata = new Map<string, Pick<MetricSample, "help" | "type">>();
  const lines: string[] = [];

  for (const sample of samples) {
    if (!metadata.has(sample.name)) {
      metadata.set(sample.name, {
        help: sample.help,
        type: sample.type,
      });
    }
  }

  for (const [name, metric] of [...metadata.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(`# HELP ${name} ${escapeHelp(metric.help)}`);
    lines.push(`# TYPE ${name} ${metric.type}`);

    for (const sample of samples.filter((candidate) => candidate.name === name)) {
      lines.push(`${sample.name}${renderLabels(sample.labels)} ${sample.value}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function createMetricKey(name: string, labels: MetricLabels): string {
  const labelKey = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");

  return labelKey.length > 0 ? `${name}{${labelKey}}` : name;
}

function normalizeLabels(labels: MetricLabels): MetricLabels {
  return Object.fromEntries(
    Object.entries(labels).map(([key, value]) => {
      assertLabelName(key);
      return [key, value];
    }),
  );
}

function normalizeMetricValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function assertMetricName(name: string): void {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new Error(`Invalid metric name: ${name}`);
  }
}

function assertLabelName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid metric label name: ${name}`);
  }
}

function renderLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return "";
  }

  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(",")}}`;
}

function escapeLabelValue(value: MetricLabelValue): string {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function escapeHelp(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
}
