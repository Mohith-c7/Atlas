import { type Prisma, type PrismaClient } from "@faios/database";
import type { AuditAction } from "@faios/events";
import { redactSensitiveValue } from "@faios/security";
import type { FastifyRequest } from "fastify";

type AuditActorType = "founder" | "system" | "worker";

type AuditEventInput = {
  readonly action: AuditAction;
  readonly actorType?: AuditActorType;
  readonly founderId: string;
  readonly correlationId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata?: unknown;
};

export type RequestAuditEventInput = Omit<
  AuditEventInput,
  "correlationId" | "founderId" | "ipAddress" | "userAgent"
>;

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return redactSensitiveValue(value) as Prisma.InputJsonValue;
}

export async function recordAuditEvent(
  database: PrismaClient,
  input: AuditEventInput,
): Promise<void> {
  await database.auditEvent.create({
    data: {
      action: input.action,
      actorType: input.actorType ?? "founder",
      correlationId: input.correlationId,
      founderId: input.founderId,
      ipAddress: input.ipAddress,
      metadata: toJsonInput(input.metadata),
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      userAgent: input.userAgent,
    },
  });
}

export async function recordRequestAuditEvent(
  database: PrismaClient,
  request: FastifyRequest,
  input: RequestAuditEventInput,
): Promise<void> {
  await recordAuditEvent(database, {
    ...input,
    correlationId: request.correlationId,
    founderId: request.founderSession.founderId,
    ipAddress: request.ip,
    userAgent:
      typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
  });
}

export function recordRequestAuditEventSafely(
  database: PrismaClient,
  request: FastifyRequest,
  input: RequestAuditEventInput,
): void {
  void recordRequestAuditEvent(database, request, input).catch((error: unknown) => {
    request.log.error(
      {
        action: input.action,
        correlationId: request.correlationId,
        error,
        founderId: request.founderSession.founderId,
      },
      "Failed to persist audit event",
    );
  });
}
