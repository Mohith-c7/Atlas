import Fastify from "fastify";
import cors from "@fastify/cors";
import { createLogger } from "@faios/logger";
import { commandRoutes } from "./features/commands/index.js";
import { correlationPlugin } from "./lib/correlation.js";

const logger = createLogger("business-api");
const server = Fastify({ loggerInstance: logger });

await server.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
});
await server.register(correlationPlugin);
await server.register(commandRoutes);

const port = Number(process.env.PORT ?? 4000);

await server.listen({ host: "0.0.0.0", port });
