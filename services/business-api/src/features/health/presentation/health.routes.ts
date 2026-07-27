import type { HealthResponse } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";

const SERVICE_NAME = "business-api";

async function checkPostgres(): Promise<HealthResponse["components"][string]> {
  const startedAt = performance.now();

  try {
    await getPrismaClient().$queryRaw`SELECT 1`;

    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : "Postgres readiness check failed.",
    };
  }
}

export const healthRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/health/live", async (_request, reply) =>
    reply.status(200).send({
      service: SERVICE_NAME,
      status: "ok",
      checkedAt: new Date().toISOString(),
      components: {},
    } satisfies HealthResponse),
  );

  server.get("/health/ready", async (_request, reply) => {
    const postgres = await checkPostgres();
    const status = postgres.status === "ok" ? "ok" : "down";

    return reply.status(status === "ok" ? 200 : 503).send({
      service: SERVICE_NAME,
      status,
      checkedAt: new Date().toISOString(),
      components: {
        postgres,
      },
    } satisfies HealthResponse);
  });

  done();
};
