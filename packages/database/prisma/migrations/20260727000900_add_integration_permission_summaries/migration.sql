CREATE TABLE "IntegrationPermissionSummary" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "scopes" TEXT[],
  "permissions" JSONB,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationPermissionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationPermissionSummary_integrationId_key"
  ON "IntegrationPermissionSummary"("integrationId");
CREATE INDEX "IntegrationPermissionSummary_founderId_provider_idx"
  ON "IntegrationPermissionSummary"("founderId", "provider");
CREATE INDEX "IntegrationPermissionSummary_checkedAt_idx"
  ON "IntegrationPermissionSummary"("checkedAt");

ALTER TABLE "IntegrationPermissionSummary"
  ADD CONSTRAINT "IntegrationPermissionSummary_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationPermissionSummary"
  ADD CONSTRAINT "IntegrationPermissionSummary_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCredential"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "refreshTokenEncryptedPayload" JSONB,
  ADD COLUMN "lastRefreshAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "refreshFailureReason" TEXT;

CREATE INDEX "IntegrationCredential_expiresAt_idx"
  ON "IntegrationCredential"("expiresAt");
