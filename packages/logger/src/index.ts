import pino from "pino";

export const createLogger = (name: string) =>
  pino({
    base: { service: name },
    level: process.env.LOG_LEVEL ?? "info",
  });
