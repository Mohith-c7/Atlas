-- Add lifecycle controls for founder memory archive and deletion retention.
ALTER TABLE "MemoryItem"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "retainUntil" TIMESTAMP(3);

CREATE INDEX "MemoryItem_founderId_archivedAt_idx" ON "MemoryItem"("founderId", "archivedAt");
CREATE INDEX "MemoryItem_founderId_deletedAt_idx" ON "MemoryItem"("founderId", "deletedAt");
CREATE INDEX "MemoryItem_retainUntil_idx" ON "MemoryItem"("retainUntil");
