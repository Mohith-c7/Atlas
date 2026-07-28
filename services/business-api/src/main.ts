import Fastify from "fastify";
import cors from "@fastify/cors";
import { createLogger } from "@faios/logger";
import { accountRoutes } from "./features/account/index.js";
import { approvalRoutes } from "./features/approvals/index.js";
import { authRoutes } from "./features/auth/index.js";
import { billingRoutes } from "./features/billing/index.js";
import { commandRoutes } from "./features/commands/index.js";
import { healthRoutes } from "./features/health/index.js";
import { integrationRoutes } from "./features/integrations/index.js";
import { memoryRoutes } from "./features/memory/index.js";
import { mcpCapabilityRoutes } from "./features/mcp-capabilities/index.js";
import { abuseControlPlugin } from "./lib/abuse-control.js";
import { accessLogPlugin } from "./lib/access-log.js";
import { correlationPlugin } from "./lib/correlation.js";
import { createCorsPolicy } from "./lib/cors-policy.js";
import { founderSessionPlugin } from "./lib/founder-session.js";
import { httpMetricsPlugin } from "./lib/http-metrics.js";
import { securityHeadersPlugin } from "./lib/security-headers.js";

const logger = createLogger("business-api");
const server = Fastify({
  disableRequestLogging: true,
  loggerInstance: logger,
});

await server.register(securityHeadersPlugin);
await server.register(cors, createCorsPolicy());
await server.register(correlationPlugin);
await server.register(httpMetricsPlugin);
await server.register(founderSessionPlugin);
await server.register(abuseControlPlugin);
await server.register(accessLogPlugin);
await server.register(healthRoutes);
await server.register(authRoutes);
await server.register(accountRoutes);
await server.register(billingRoutes);
await server.register(approvalRoutes);
await server.register(integrationRoutes);
await server.register(memoryRoutes);
await server.register(mcpCapabilityRoutes);
await server.register(commandRoutes);

const port = Number(process.env.PORT ?? 4000);

await server.listen({ host: "0.0.0.0", port });
