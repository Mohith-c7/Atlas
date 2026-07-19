import Fastify from "fastify";
import { createLogger } from "@faios/logger";

const logger = createLogger("business-api");
const server = Fastify({ loggerInstance: logger });

const port = Number(process.env.PORT ?? 4000);

await server.listen({ host: "0.0.0.0", port });
