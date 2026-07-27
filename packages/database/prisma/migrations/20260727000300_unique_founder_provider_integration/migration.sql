-- Ensure each founder has a single canonical connection per provider.
CREATE UNIQUE INDEX "IntegrationConnection_founderId_provider_key"
  ON "IntegrationConnection"("founderId", "provider");
