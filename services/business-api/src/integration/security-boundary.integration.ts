import cors from "@fastify/cors";
import { redactHttpHeaders, redactSensitiveValue } from "@faios/security";
import Fastify from "fastify";
import { commandRoutes } from "../features/commands/index.js";
import { healthRoutes } from "../features/health/index.js";
import { abuseControlPlugin } from "../lib/abuse-control.js";
import { accessLogPlugin } from "../lib/access-log.js";
import { correlationPlugin } from "../lib/correlation.js";
import { createCorsPolicy } from "../lib/cors-policy.js";
import { founderSessionPlugin } from "../lib/founder-session.js";
import { securityHeadersPlugin } from "../lib/security-headers.js";

function setTestEnvironment() {
  process.env.APP_ENV = "test";
  process.env.FAIOS_DEV_AUTH_ENABLED = "true";
  process.env.CORS_ALLOWED_ORIGINS = "https://app.faios.test";
  process.env.BUSINESS_API_RATE_LIMIT_ENABLED = "true";
  process.env.BUSINESS_API_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.BUSINESS_API_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.BUSINESS_API_COMMAND_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.BUSINESS_API_COMMAND_RATE_LIMIT_MAX_REQUESTS = "1";
}

function restoreEnvironment(snapshot: NodeJS.ProcessEnv) {
  process.env.APP_ENV = snapshot.APP_ENV;
  process.env.FAIOS_DEV_AUTH_ENABLED = snapshot.FAIOS_DEV_AUTH_ENABLED;
  process.env.CORS_ALLOWED_ORIGINS = snapshot.CORS_ALLOWED_ORIGINS;
  process.env.BUSINESS_API_RATE_LIMIT_ENABLED = snapshot.BUSINESS_API_RATE_LIMIT_ENABLED;
  process.env.BUSINESS_API_RATE_LIMIT_WINDOW_MS = snapshot.BUSINESS_API_RATE_LIMIT_WINDOW_MS;
  process.env.BUSINESS_API_RATE_LIMIT_MAX_REQUESTS = snapshot.BUSINESS_API_RATE_LIMIT_MAX_REQUESTS;
  process.env.BUSINESS_API_COMMAND_RATE_LIMIT_WINDOW_MS =
    snapshot.BUSINESS_API_COMMAND_RATE_LIMIT_WINDOW_MS;
  process.env.BUSINESS_API_COMMAND_RATE_LIMIT_MAX_REQUESTS =
    snapshot.BUSINESS_API_COMMAND_RATE_LIMIT_MAX_REQUESTS;
}

const originalEnvironment = { ...process.env };
setTestEnvironment();

const server = Fastify({ logger: false });
await server.register(securityHeadersPlugin);
await server.register(cors, createCorsPolicy());
await server.register(correlationPlugin);
await server.register(founderSessionPlugin);
await server.register(abuseControlPlugin);
await server.register(accessLogPlugin);
await server.register(healthRoutes);
await server.register(commandRoutes);

try {
  const healthResponse = await server.inject({
    method: "GET",
    url: "/health",
    headers: {
      origin: "https://app.faios.test",
    },
  });

  if (healthResponse.headers["access-control-allow-origin"] !== "https://app.faios.test") {
    throw new Error("Allowed CORS origin was not echoed.");
  }

  if (healthResponse.headers["x-content-type-options"] !== "nosniff") {
    throw new Error("Security headers were not applied.");
  }

  for (let index = 0; index < 3; index += 1) {
    const livenessResponse = await server.inject({
      method: "GET",
      url: "/health/live",
    });

    if (livenessResponse.statusCode !== 200) {
      throw new Error("Health checks must bypass rate limiting.");
    }
  }

  const blockedCorsResponse = await server.inject({
    method: "OPTIONS",
    url: "/health",
    headers: {
      "access-control-request-method": "GET",
      origin: "https://evil.example",
    },
  });

  if (blockedCorsResponse.headers["access-control-allow-origin"]) {
    throw new Error("Unexpected CORS allow-origin header for blocked origin.");
  }

  await server.inject({
    method: "POST",
    url: "/api/v1/commands",
    headers: {
      "content-type": "application/json",
      "x-faios-founder-email": "founder@faios.test",
      "x-faios-founder-id": "security_founder",
    },
    payload: {},
  });

  const rateLimitedResponse = await server.inject({
    method: "POST",
    url: "/api/v1/commands",
    headers: {
      "content-type": "application/json",
      "x-faios-founder-email": "founder@faios.test",
      "x-faios-founder-id": "security_founder",
    },
    payload: {},
  });

  if (rateLimitedResponse.statusCode !== 429) {
    throw new Error(
      `Expected command rate limit response, received ${rateLimitedResponse.statusCode}.`,
    );
  }

  const redactedHeaders = redactHttpHeaders({
    authorization: "Bearer secret-token",
    "x-correlation-id": "correlation-1",
  });

  if (redactedHeaders.authorization !== "[REDACTED]") {
    throw new Error("Authorization header was not redacted.");
  }

  const redactedPayload = redactSensitiveValue({
    nested: {
      accessToken: "ghp_super_secret_token",
      note: "contact founder@example.com",
    },
  });

  if (JSON.stringify(redactedPayload).includes("founder@example.com")) {
    throw new Error("Sensitive text was not redacted from nested payload.");
  }
} finally {
  await server.close();
  restoreEnvironment(originalEnvironment);
}
