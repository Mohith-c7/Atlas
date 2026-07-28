import type { CorrelationId, FounderId } from "@faios/types";

export type DomainEventType =
  | "founder.created"
  | "company-profile.updated"
  | "integration.connected"
  | "command.received"
  | "command.planned"
  | "command.completed"
  | "approval.requested"
  | "tool-invocation.completed"
  | "memory.updated";

export type AuditAction =
  | "account.update"
  | "command.create"
  | "command.plan"
  | "approval.decide"
  | "integration.connect"
  | "integration.disconnect"
  | "integration.reconnect"
  | "integration.credential.refresh"
  | "integration.credential.rotate"
  | "tool.execute"
  | "memory.write"
  | "memory.update"
  | "memory.delete"
  | "memory.archive"
  | "memory.merge"
  | "memory.import"
  | "memory.retention.purge";

export type MetricName =
  | "command_planning_duration_ms"
  | "tool_execution_duration_ms"
  | "approval_decision_total"
  | "integration_connection_total"
  | "memory_write_total";

export interface DomainEventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: DomainEventType;
  readonly founderId: FounderId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
  readonly schemaVersion: number;
  readonly payload: TPayload;
}

export interface AuditEventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly action: AuditAction;
  readonly founderId: FounderId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
  readonly actor: "founder" | "system" | "worker";
  readonly payload: TPayload;
}

export interface MetricEnvelope {
  readonly metric: MetricName;
  readonly value: number;
  readonly unit: "count" | "milliseconds";
  readonly recordedAt: string;
  readonly dimensions: Record<string, string>;
}
