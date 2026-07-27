CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

CREATE TABLE "BillingCustomer" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "billingCustomerId" TEXT,
  "provider" TEXT NOT NULL,
  "providerSubscriptionId" TEXT,
  "status" "SubscriptionStatus" NOT NULL,
  "planKey" TEXT NOT NULL,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "trialEndsAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanEntitlement" (
  "id" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageCounter" (
  "id" TEXT NOT NULL,
  "founderId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "limit" INTEGER,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCustomer_founderId_key" ON "BillingCustomer"("founderId");
CREATE UNIQUE INDEX "BillingCustomer_providerCustomerId_key" ON "BillingCustomer"("providerCustomerId");
CREATE INDEX "BillingCustomer_provider_providerCustomerId_idx"
  ON "BillingCustomer"("provider", "providerCustomerId");

CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key"
  ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_founderId_status_idx" ON "Subscription"("founderId", "status");
CREATE INDEX "Subscription_planKey_status_idx" ON "Subscription"("planKey", "status");
CREATE INDEX "Subscription_provider_providerSubscriptionId_idx"
  ON "Subscription"("provider", "providerSubscriptionId");

CREATE UNIQUE INDEX "PlanEntitlement_planKey_featureKey_key"
  ON "PlanEntitlement"("planKey", "featureKey");
CREATE INDEX "PlanEntitlement_planKey_idx" ON "PlanEntitlement"("planKey");

CREATE UNIQUE INDEX "UsageCounter_founderId_featureKey_periodStart_periodEnd_key"
  ON "UsageCounter"("founderId", "featureKey", "periodStart", "periodEnd");
CREATE INDEX "UsageCounter_founderId_featureKey_idx" ON "UsageCounter"("founderId", "featureKey");
CREATE INDEX "UsageCounter_periodEnd_idx" ON "UsageCounter"("periodEnd");

ALTER TABLE "BillingCustomer"
  ADD CONSTRAINT "BillingCustomer_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_billingCustomerId_fkey"
  FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageCounter"
  ADD CONSTRAINT "UsageCounter_founderId_fkey"
  FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
