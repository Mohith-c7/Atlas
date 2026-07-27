import Fastify from "fastify";
import cors from "@fastify/cors";
import { createLogger } from "@faios/logger";
import { approvalRoutes } from "./features/approvals/index.js";
import { commandRoutes } from "./features/commands/index.js";
import { integrationRoutes } from "./features/integrations/index.js";
import { mcpCapabilityRoutes } from "./features/mcp-capabilities/index.js";
import { correlationPlugin } from "./lib/correlation.js";
import { founderSessionPlugin } from "./lib/founder-session.js";

const logger = createLogger("business-api");
const server = Fastify({ loggerInstance: logger });

await server.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
});
await server.register(correlationPlugin);
await server.register(founderSessionPlugin);
await server.register(approvalRoutes);
await server.register(integrationRoutes);
await server.register(mcpCapabilityRoutes);
await server.register(commandRoutes);

const port = Number(process.env.PORT ?? 4000);

await server.listen({ host: "0.0.0.0", port });
