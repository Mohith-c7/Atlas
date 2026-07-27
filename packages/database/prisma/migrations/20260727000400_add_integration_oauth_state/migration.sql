CREATE TABLE "IntegrationOAuthState" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IntegrationOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationOAuthState_state_key" ON "IntegrationOAuthState"("state");
CREATE INDEX "IntegrationOAuthState_founderId_provider_expiresAt_idx"
  ON "IntegrationOAuthState"("founderId", "provider", "expiresAt");
CREATE INDEX "IntegrationOAuthState_state_expiresAt_idx"
  ON "IntegrationOAuthState"("state", "expiresAt");

ALTER TABLE "IntegrationOAuthState"
  ADD CONSTRAINT "IntegrationOAuthState_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
