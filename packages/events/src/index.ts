import type { CorrelationId, TenantId } from "@faios/types";

export type DomainEventType =
  | "user.created"
  | "workspace.created"
  | "integration.connected"
  | "workflow.completed"
  | "notification.sent"
  | "meeting.scheduled"
  | "memory.updated";

export interface DomainEventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: DomainEventType;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
  readonly schemaVersion: number;
  readonly payload: TPayload;
}
