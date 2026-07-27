import Fastify from "fastify";
import { healthResponseSchema } from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import { healthRoutes } from "../features/health/index.js";

const database = getPrismaClient();

async function main() {
  const server = Fastify();

  await server.register(healthRoutes);

  try {
    const liveResponse = await server.inject({
      method: "GET",
      url: "/health/live",
    });

    if (liveResponse.statusCode !== 200) {
      throw new Error(`Expected live check 200, received ${liveResponse.statusCode}.`);
    }

    const livePayload = healthResponseSchema.parse(liveResponse.json());

    if (livePayload.status !== "ok") {
      throw new Error("Expected live check to be ok.");
    }

    const readyResponse = await server.inject({
      method: "GET",
      url: "/health/ready",
    });

    if (readyResponse.statusCode !== 200) {
      throw new Error(`Expected ready check 200, received ${readyResponse.statusCode}.`);
    }

    const readyPayload = healthResponseSchema.parse(readyResponse.json());

    if (readyPayload.components.postgres?.status !== "ok") {
      throw new Error("Expected Postgres readiness component to be ok.");
    }
  } finally {
    await server.close();
    await database.$disconnect();
  }
}

await main();
