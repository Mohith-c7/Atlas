import type { FastifyCorsOptions } from "@fastify/cors";

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

function splitCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function isProductionEnvironment() {
  return process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
}

export function readAllowedCorsOrigins(): Set<string> {
  const configuredOrigins = [
    process.env.WEB_ORIGIN,
    process.env.PUBLIC_WEB_URL,
    ...splitCsv(process.env.CORS_ALLOWED_ORIGINS),
  ].filter((origin): origin is string => Boolean(origin));

  if (configuredOrigins.length > 0) {
    return new Set(configuredOrigins);
  }

  return isProductionEnvironment() ? new Set<string>() : LOCAL_ORIGINS;
}

export function createCorsPolicy(): FastifyCorsOptions {
  const allowedOrigins = readAllowedCorsOrigins();

  return {
    allowedHeaders: ["authorization", "content-type", "stripe-signature", "x-correlation-id"],
    credentials: true,
    exposedHeaders: ["retry-after", "x-correlation-id"],
    maxAge: 600,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
  };
}
