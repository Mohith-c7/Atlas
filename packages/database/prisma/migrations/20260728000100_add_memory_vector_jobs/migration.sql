CREATE TYPE "MemoryVectorJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "MemoryVectorJob" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "status" "MemoryVectorJobStatus" NOT NULL DEFAULT 'PENDING',
    "action" TEXT NOT NULL,
    "memoryIds" TEXT[],
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryVectorJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryVectorJob_idempotencyKey_key" ON "MemoryVectorJob"("idempotencyKey");
CREATE INDEX "MemoryVectorJob_founderId_status_idx" ON "MemoryVectorJob"("founderId", "status");
CREATE INDEX "MemoryVectorJob_status_nextAttemptAt_idx" ON "MemoryVectorJob"("status", "nextAttemptAt");
CREATE INDEX "MemoryVectorJob_createdAt_idx" ON "MemoryVectorJob"("createdAt");

ALTER TABLE "MemoryVectorJob" ADD CONSTRAINT "MemoryVectorJob_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "FounderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
