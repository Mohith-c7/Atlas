import type { FounderWorkflow } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { createDefaultMcpAdapterRegistry } from "@faios/mcp";
import { DatabaseMcpCredentialResolver } from "../../integrations/infrastructure/database-mcp-credential.resolver.js";

type WorkflowDefinition = Omit<FounderWorkflow, "readinessStatus">;

const WORKFLOW_DEFINITIONS = [
  {
    id: "github.create_issue",
    title: "Create GitHub issue",
    description: "Turn a founder voice or chat command into a reviewed GitHub issue.",
    triggerExamples: [
      "Create a GitHub issue for the onboarding bug",
      "Open an issue for the dashboard polish",
    ],
    provider: "github",
    capabilityKeys: ["repository.createIssue"],
    requiresApproval: true,
    executionMode: "approval_required",
    implementationStatus: "live",
  },
  {
    id: "github.repository_status",
    title: "Summarize GitHub repository status",
    description: "Summarize repository health, open issues, and pull request activity.",
    triggerExamples: ["Summarize GitHub repo status", "What is open in the repository right now?"],
    provider: "github",
    capabilityKeys: ["repository.summarizeStatus"],
    requiresApproval: false,
    executionMode: "automatic",
    implementationStatus: "live",
  },
  {
    id: "calendar.schedule_meeting",
    title: "Find availability and schedule a meeting",
    description: "Coordinate founder availability and create a calendar event.",
    triggerExamples: ["Find time with Priya tomorrow", "Schedule a customer discovery call"],
    provider: "google-calendar",
    capabilityKeys: ["calendar.schedule"],
    requiresApproval: true,
    executionMode: "planned_only",
    implementationStatus: "planned",
  },
  {
    id: "email.summarize_unread",
    title: "Summarize unread founder emails",
    description: "Extract important unread email threads and suggested next actions.",
    triggerExamples: ["Summarize my unread emails", "What emails need my attention?"],
    provider: "gmail",
    capabilityKeys: ["knowledge.search", "communication.send"],
    requiresApproval: false,
    executionMode: "planned_only",
    implementationStatus: "planned",
  },
  {
    id: "slack.draft_update",
    title: "Draft Slack update",
    description: "Prepare a concise founder update for a Slack channel.",
    triggerExamples: ["Draft a Slack update for launch progress", "Summarize and post team status"],
    provider: "slack",
    capabilityKeys: ["communication.send"],
    requiresApproval: true,
    executionMode: "planned_only",
    implementationStatus: "planned",
  },
  {
    id: "memory.personalized_follow_up",
    title: "Use memory to personalize a follow-up",
    description: "Use organizational memory to tailor a founder follow-up draft.",
    triggerExamples: ["Draft a follow-up using what we know about this investor"],
    provider: "faios-memory",
    capabilityKeys: ["knowledge.search", "communication.send"],
    requiresApproval: true,
    executionMode: "planned_only",
    implementationStatus: "planned",
  },
] satisfies WorkflowDefinition[];

export class WorkflowCatalog {
  public constructor(private readonly database: PrismaClient) {}

  public async listFounderWorkflows(founderId: string): Promise<FounderWorkflow[]> {
    const readyCapabilities = await this.listReadyCapabilities(founderId);

    return WORKFLOW_DEFINITIONS.map((workflow) => ({
      ...workflow,
      readinessStatus:
        workflow.implementationStatus === "planned"
          ? "planned"
          : workflow.capabilityKeys.every((capabilityKey) =>
                readyCapabilities.has(`${workflow.provider}:${capabilityKey}`),
              )
            ? "ready"
            : "not_connected",
    }));
  }

  private async listReadyCapabilities(founderId: string): Promise<Set<string>> {
    const registry = createDefaultMcpAdapterRegistry({
      credentialResolver: new DatabaseMcpCredentialResolver(this.database),
      includeRealProviderAdapters: true,
    });
    const readiness = await registry.listReadiness(founderId);

    return new Set(
      readiness
        .filter((item) => item.status === "ready")
        .map((item) => `${item.provider}:${item.capabilityKey}`),
    );
  }
}
