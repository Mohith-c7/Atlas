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

export const mcpCapabilityStatusSchema = z.enum(["available", "not_connected", "disabled"]);

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);

export const toolInvocationStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const integrationProviderSchema = z.enum(["github"]);

export const integrationConnectionStatusSchema = z.enum(["connected", "disconnected", "disabled"]);

export const founderSessionSourceSchema = z.enum(["development", "session"]);

export const currentFounderResponseSchema = z.object({
  founder: z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string().nullable().optional(),
  }),
  session: z.object({
    id: z.string().nullable().optional(),
    source: founderSessionSourceSchema,
    expiresAt: z.string().nullable().optional(),
  }),
  correlationId: z.string(),
});

export const founderAccountSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable().optional(),
  profile: z.object({
    timezone: z.string().nullable().optional(),
    locale: z.string().nullable().optional(),
    operatingStyle: z.string().nullable().optional(),
    defaultVoice: z.string().nullable().optional(),
    approvalSettings: z.unknown().optional(),
  }),
  companyProfile: z.object({
    name: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    stage: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    context: z.unknown().optional(),
  }),
});

export const getFounderAccountResponseSchema = z.object({
  account: founderAccountSchema,
  correlationId: z.string(),
});

export const updateFounderAccountRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  profile: z
    .object({
      timezone: z.string().trim().min(1).max(120).nullable().optional(),
      locale: z.string().trim().min(2).max(20).nullable().optional(),
      operatingStyle: z.string().trim().min(1).max(2000).nullable().optional(),
      defaultVoice: z.string().trim().min(1).max(120).nullable().optional(),
      approvalSettings: z.unknown().optional(),
    })
    .optional(),
  companyProfile: z
    .object({
      name: z.string().trim().min(1).max(160).nullable().optional(),
      industry: z.string().trim().min(1).max(160).nullable().optional(),
      stage: z.string().trim().min(1).max(120).nullable().optional(),
      description: z.string().trim().min(1).max(4000).nullable().optional(),
      context: z.unknown().optional(),
    })
    .optional(),
});

export const founderSessionSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["active", "revoked", "expired"]),
  issuedAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  isCurrent: z.boolean(),
});

export const listFounderSessionsResponseSchema = z.object({
  sessions: z.array(founderSessionSummarySchema),
  correlationId: z.string(),
});

export const revokeFounderSessionResponseSchema = z.object({
  session: founderSessionSummarySchema,
  correlationId: z.string(),
});

export const billingSubscriptionStatusSchema = z.enum([
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "none",
]);

export const planEntitlementSchema = z.object({
  planKey: z.string(),
  featureKey: z.string(),
  enabled: z.boolean(),
  limit: z.number().int().nullable().optional(),
});

export const usageCounterSchema = z.object({
  featureKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nullable().optional(),
});

export const billingStatusSchema = z.object({
  planKey: z.string(),
  status: billingSubscriptionStatusSchema,
  currentPeriodEnd: z.string().nullable().optional(),
  cancelAtPeriodEnd: z.boolean(),
  entitlements: z.array(planEntitlementSchema),
  usage: z.array(usageCounterSchema),
});

export const getBillingStatusResponseSchema = z.object({
  billing: billingStatusSchema,
  correlationId: z.string(),
});

export const memoryKindSchema = z.enum([
  "founder_profile",
  "company_fact",
  "preference",
  "decision",
  "contact",
  "workflow_pattern",
  "summary",
]);

export const mcpCapabilitySchema = z.object({
  key: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  requiresApproval: z.boolean(),
  status: mcpCapabilityStatusSchema,
});

export const listCapabilitiesResponseSchema = z.object({
  capabilities: z.array(mcpCapabilitySchema),
});

export const githubIntegrationConnectionRequestSchema = z.object({
  accountLabel: z.string().min(1).max(120).optional(),
  owner: z.string().min(1).max(120),
  repo: z.string().min(1).max(120),
  accessToken: z.string().min(1).max(512),
  apiBaseUrl: z.string().url().default("https://api.github.com"),
});

export const startGitHubOAuthRequestSchema = z.object({
  accountLabel: z.string().min(1).max(120).optional(),
  owner: z.string().min(1).max(120),
  repo: z.string().min(1).max(120),
  redirectUri: z.string().url(),
  apiBaseUrl: z.string().url().default("https://api.github.com"),
});

export const startGitHubOAuthResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string().min(1),
  expiresAt: z.string(),
  correlationId: z.string(),
});

export const completeGitHubOAuthResponseSchema = z.object({
  connection: z.lazy(() => integrationConnectionSchema),
  correlationId: z.string(),
});

export const integrationConnectionSchema = z.object({
  id: z.string(),
  provider: integrationProviderSchema,
  accountLabel: z.string().nullable().optional(),
  status: integrationConnectionStatusSchema,
  capabilityKeys: z.array(z.string()),
  metadata: z
    .object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      apiBaseUrl: z.string().optional(),
    })
    .passthrough()
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const connectIntegrationResponseSchema = z.object({
  connection: integrationConnectionSchema,
  correlationId: z.string(),
});

export const listIntegrationConnectionsResponseSchema = z.object({
  connections: z.array(integrationConnectionSchema),
  correlationId: z.string(),
});

export const createCommandRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  source: commandSourceSchema.default("chat"),
  input: z.string().min(1).max(8000),
});

export const voiceTranscriptionRequestSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(120),
  language: z.string().min(2).max(20).optional(),
  correlationId: z.string().min(1),
});

export const voiceTranscriptionResponseSchema = z.object({
  transcript: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
  correlationId: z.string(),
});

export const memoryContextItemSchema = z.object({
  id: z.string(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  source: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.string(),
});

export const planCommandRequestSchema = z.object({
  commandId: z.string().min(1),
  founderId: z.string(),
  conversationId: z.string().optional(),
  source: commandSourceSchema,
  input: z.string().min(1),
  correlationId: z.string(),
  availableCapabilities: z.array(mcpCapabilitySchema).default([]),
  memoryContext: z.array(memoryContextItemSchema).default([]),
});

export const githubCreateIssueExecutionPayloadSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(65536).optional(),
  labels: z.array(z.string().min(1)).max(20).optional(),
});

export const executionStepSchema = z.object({
  capability: z.string(),
  provider: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  reason: z.string(),
  executionPayload: z.unknown().optional(),
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

export const approvalRequestSchema = z.object({
  id: z.string(),
  commandId: z.string(),
  status: approvalStatusSchema,
  reason: z.string(),
  payload: z
    .object({
      capability: z.string(),
      provider: z.string().optional(),
      reason: z.string(),
      commandSummary: z.string().optional(),
      executionPayload: z.unknown().optional(),
    })
    .passthrough()
    .optional(),
  requestedAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
});

export const listApprovalsResponseSchema = z.object({
  approvals: z.array(approvalRequestSchema),
});

export const approvalDecisionResponseSchema = z.object({
  approval: approvalRequestSchema,
});

export const toolInvocationSchema = z.object({
  id: z.string(),
  commandId: z.string(),
  capabilityKey: z.string(),
  provider: z.string().nullable().optional(),
  status: toolInvocationStatusSchema,
  requestPayload: z.unknown().optional(),
  responsePayload: z.unknown().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  nextAttemptAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const executionJobSchema = z.object({
  invocationId: z.string(),
  commandId: z.string(),
  founderId: z.string(),
  capabilityKey: z.string(),
  provider: z.string().nullable().optional(),
  requestPayload: z.unknown().optional(),
});

export const executionDispatchExchange = "faios.execution";
export const executionDispatchQueue = "faios.execution.invocations";
export const executionDispatchDeadLetterQueue = "faios.execution.invocations.dead-letter";
export const executionDispatchDeadLetterRoutingKey = "execution.invocation.dead-lettered";
export const executionDispatchRoutingKey = "execution.invocation.queued";

export const executionDispatchMessageSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("execution.invocation.queued"),
  invocationId: z.string(),
  commandId: z.string(),
  founderId: z.string(),
  capabilityKey: z.string(),
  provider: z.string().nullable().optional(),
  correlationId: z.string().optional(),
  enqueuedAt: z.string(),
});

export const commandExecutionTimelineItemSchema = z.object({
  commandId: z.string(),
  status: commandStatusSchema,
  summary: z.string().nullable().optional(),
  rawInput: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invocations: z.array(toolInvocationSchema),
});

export const listCommandExecutionsResponseSchema = z.object({
  executions: z.array(commandExecutionTimelineItemSchema),
});

export const commandExecutionSnapshotEventSchema = z.object({
  event: z.literal("command.execution.snapshot"),
  executions: z.array(commandExecutionTimelineItemSchema),
  correlationId: z.string(),
  emittedAt: z.string(),
});

export const healthComponentSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().optional(),
});

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded", "down"]),
  checkedAt: z.string(),
  components: z.record(healthComponentSchema).default({}),
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
export type ApprovalDecisionResponse = z.infer<typeof approvalDecisionResponseSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type CommandSource = z.infer<typeof commandSourceSchema>;
export type CommandStatus = z.infer<typeof commandStatusSchema>;
export type CommandExecutionTimelineItem = z.infer<typeof commandExecutionTimelineItemSchema>;
export type ConnectIntegrationResponse = z.infer<typeof connectIntegrationResponseSchema>;
export type CreateCommandRequest = z.infer<typeof createCommandRequestSchema>;
export type CreateCommandResponse = z.infer<typeof createCommandResponseSchema>;
export type CurrentFounderResponse = z.infer<typeof currentFounderResponseSchema>;
export type FounderAccount = z.infer<typeof founderAccountSchema>;
export type FounderSessionSummary = z.infer<typeof founderSessionSummarySchema>;
export type BillingStatus = z.infer<typeof billingStatusSchema>;
export type BillingSubscriptionStatus = z.infer<typeof billingSubscriptionStatusSchema>;
export type GetFounderAccountResponse = z.infer<typeof getFounderAccountResponseSchema>;
export type GetBillingStatusResponse = z.infer<typeof getBillingStatusResponseSchema>;
export type ListFounderSessionsResponse = z.infer<typeof listFounderSessionsResponseSchema>;
export type PlanEntitlement = z.infer<typeof planEntitlementSchema>;
export type RevokeFounderSessionResponse = z.infer<typeof revokeFounderSessionResponseSchema>;
export type UpdateFounderAccountRequest = z.infer<typeof updateFounderAccountRequestSchema>;
export type UsageCounter = z.infer<typeof usageCounterSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type ExecutionStep = z.infer<typeof executionStepSchema>;
export type ExecutionJob = z.infer<typeof executionJobSchema>;
export type ExecutionDispatchMessage = z.infer<typeof executionDispatchMessageSchema>;
export type GitHubIntegrationConnectionRequest = z.infer<
  typeof githubIntegrationConnectionRequestSchema
>;
export type StartGitHubOAuthRequest = z.infer<typeof startGitHubOAuthRequestSchema>;
export type StartGitHubOAuthResponse = z.infer<typeof startGitHubOAuthResponseSchema>;
export type CompleteGitHubOAuthResponse = z.infer<typeof completeGitHubOAuthResponseSchema>;
export type GitHubCreateIssueExecutionPayload = z.infer<
  typeof githubCreateIssueExecutionPayloadSchema
>;
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;
export type IntegrationConnectionStatus = z.infer<typeof integrationConnectionStatusSchema>;
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type ListCapabilitiesResponse = z.infer<typeof listCapabilitiesResponseSchema>;
export type ListCommandExecutionsResponse = z.infer<typeof listCommandExecutionsResponseSchema>;
export type CommandExecutionSnapshotEvent = z.infer<typeof commandExecutionSnapshotEventSchema>;
export type ListIntegrationConnectionsResponse = z.infer<
  typeof listIntegrationConnectionsResponseSchema
>;
export type ListApprovalsResponse = z.infer<typeof listApprovalsResponseSchema>;
export type MemoryContextItem = z.infer<typeof memoryContextItemSchema>;
export type MemoryKind = z.infer<typeof memoryKindSchema>;
export type McpCapability = z.infer<typeof mcpCapabilitySchema>;
export type McpCapabilityStatus = z.infer<typeof mcpCapabilityStatusSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type PlanCommandRequest = z.infer<typeof planCommandRequestSchema>;
export type PlanCommandResponse = z.infer<typeof planCommandResponseSchema>;
export type ToolInvocation = z.infer<typeof toolInvocationSchema>;
export type ToolInvocationStatus = z.infer<typeof toolInvocationStatusSchema>;
export type VoiceTranscriptionRequest = z.infer<typeof voiceTranscriptionRequestSchema>;
export type VoiceTranscriptionResponse = z.infer<typeof voiceTranscriptionResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const aiCommandRequestSchema = planCommandRequestSchema;
export type AiCommandRequest = PlanCommandRequest;
