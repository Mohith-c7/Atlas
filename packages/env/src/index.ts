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
  MEMORY_VECTOR_SYNC_MODE: z.enum(["async", "disabled"]).default("async"),
  MEMORY_VECTOR_JOB_DISPATCH_ENABLED: z.coerce.boolean().default(false),
  MEMORY_VECTOR_QUEUE_NAME: z.string().min(1).default("faios.memory.vector-sync"),
  MEMORY_VECTOR_DEAD_LETTER_QUEUE_NAME: z.string().min(1).default("faios.memory.vector-sync.dlq"),
  MEMORY_VECTOR_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  MEMORY_VECTOR_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  MEMORY_VECTOR_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  MEMORY_VECTOR_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),
  WORKER_MEMORY_VECTOR_RABBITMQ_CONSUMER_ENABLED: z.coerce.boolean().default(false),
  WORKER_MEMORY_VECTOR_LOOP_ENABLED: z.coerce.boolean().default(false),
  WORKER_MEMORY_VECTOR_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
