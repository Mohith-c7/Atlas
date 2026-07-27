CREATE TYPE "FounderSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "FounderAuthIdentity" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FounderAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FounderSession" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "FounderSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FounderSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FounderAuthIdentity_provider_providerSubject_key"
  ON "FounderAuthIdentity"("provider", "providerSubject");
CREATE INDEX "FounderAuthIdentity_founderId_idx" ON "FounderAuthIdentity"("founderId");
CREATE INDEX "FounderAuthIdentity_email_idx" ON "FounderAuthIdentity"("email");

CREATE UNIQUE INDEX "FounderSession_tokenHash_key" ON "FounderSession"("tokenHash");
CREATE INDEX "FounderSession_founderId_status_idx" ON "FounderSession"("founderId", "status");
CREATE INDEX "FounderSession_tokenHash_status_expiresAt_idx"
  ON "FounderSession"("tokenHash", "status", "expiresAt");
CREATE INDEX "FounderSession_expiresAt_idx" ON "FounderSession"("expiresAt");

ALTER TABLE "FounderAuthIdentity"
  ADD CONSTRAINT "FounderAuthIdentity_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FounderSession"
  ADD CONSTRAINT "FounderSession_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
