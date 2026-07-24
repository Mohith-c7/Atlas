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

export interface DomainEventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: DomainEventType;
  readonly founderId: FounderId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
  readonly schemaVersion: number;
  readonly payload: TPayload;
}
