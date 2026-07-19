import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  correlationId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).default(25),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
