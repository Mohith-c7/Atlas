CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "correlationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_founderId_createdAt_idx" ON "AuditEvent"("founderId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_founderId_fkey"
FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
