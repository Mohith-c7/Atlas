import { z } from "zod";

export const commandSourceSchema = z.enum(["voice", "chat"]);

export const commandStatusSchema = z.enum([
  "received",
  "planning",
  "awaiting_approval",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);

export const createCommandRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  source: commandSourceSchema.default("chat"),
  input: z.string().min(1).max(8000),
});

export const planCommandRequestSchema = z.object({
  commandId: z.string().min(1),
  founderId: z.string(),
  conversationId: z.string().optional(),
  source: commandSourceSchema,
  input: z.string().min(1),
  correlationId: z.string(),
});

export const executionStepSchema = z.object({
  capability: z.string(),
  provider: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  reason: z.string(),
});

export const executionPlanSchema = z.object({
  commandId: z.string(),
  summary: z.string(),
  steps: z.array(executionStepSchema),
});

export const planCommandResponseSchema = executionPlanSchema.extend({
  status: commandStatusSchema,
});

export const createCommandResponseSchema = z.object({
  commandId: z.string(),
  conversationId: z.string(),
  status: commandStatusSchema,
  summary: z.string(),
  steps: z.array(executionStepSchema),
  correlationId: z.string(),
});

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
export type CommandSource = z.infer<typeof commandSourceSchema>;
export type CommandStatus = z.infer<typeof commandStatusSchema>;
export type CreateCommandRequest = z.infer<typeof createCommandRequestSchema>;
export type CreateCommandResponse = z.infer<typeof createCommandResponseSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type ExecutionStep = z.infer<typeof executionStepSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type PlanCommandRequest = z.infer<typeof planCommandRequestSchema>;
export type PlanCommandResponse = z.infer<typeof planCommandResponseSchema>;

export const aiCommandRequestSchema = planCommandRequestSchema;
export type AiCommandRequest = PlanCommandRequest;
