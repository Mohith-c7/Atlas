import { z } from "zod";

export const serverEnvSchema = z.object({
  APP_ENV: z.enum(["local", "development", "staging", "production"]).default("local"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  QDRANT_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
