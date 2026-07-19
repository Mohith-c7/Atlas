import { z } from "zod";

export const capabilityNameSchema = z.enum([
  "task.create",
  "task.update",
  "communication.send",
  "calendar.schedule",
  "knowledge.search",
  "repository.create-issue",
]);

export const mcpCapabilitySchema = z.object({
  name: capabilityNameSchema,
  provider: z.string(),
  description: z.string(),
  requiresApproval: z.boolean().default(false),
});

export type CapabilityName = z.infer<typeof capabilityNameSchema>;
export type McpCapability = z.infer<typeof mcpCapabilitySchema>;
