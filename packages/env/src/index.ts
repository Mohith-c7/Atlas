import { z } from "zod";

export const serverEnvSchema = z.object({
  APP_ENV: z.enum(["local", "development", "staging", "production"]).default("local"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  QDRANT_URL: z.string().url(),
  QDRANT_MEMORY_COLLECTION: z.string().min(1).default("faios_memory"),
  MEMORY_EMBEDDING_PROVIDER: z.enum(["auto", "openai", "deterministic"]).default("auto"),
  MEMORY_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  MEMORY_VECTOR_SYNC_MODE: z.enum(["async", "inline", "disabled"]).default("async"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
