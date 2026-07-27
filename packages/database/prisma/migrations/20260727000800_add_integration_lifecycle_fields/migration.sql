ALTER TABLE "IntegrationConnection"
  ADD COLUMN "statusReason" TEXT,
  ADD COLUMN "connectedAt" TIMESTAMP(3),
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastHealthStatus" TEXT,
  ADD COLUMN "lastHealthCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastHealthMessage" TEXT;

ALTER TABLE "IntegrationCredential"
  ADD COLUMN "rotatedAt" TIMESTAMP(3),
  ADD COLUMN "rotationReason" TEXT;

CREATE TABLE "IntegrationLifecycleEvent" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "integrationId" TEXT,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IntegrationLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationLifecycleEvent_founderId_provider_createdAt_idx"
  ON "IntegrationLifecycleEvent"("founderId", "provider", "createdAt");
CREATE INDEX "IntegrationLifecycleEvent_integrationId_eventType_idx"
  ON "IntegrationLifecycleEvent"("integrationId", "eventType");

ALTER TABLE "IntegrationLifecycleEvent"
  ADD CONSTRAINT "IntegrationLifecycleEvent_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationLifecycleEvent"
  ADD CONSTRAINT "IntegrationLifecycleEvent_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
