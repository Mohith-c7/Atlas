import type { McpCapability } from "@faios/contracts";

export const DEFAULT_MCP_CAPABILITIES = [
  {
    key: "calendar.schedule",
    provider: "google-calendar",
    label: "Schedule calendar events",
    description: "Prepare meetings and calendar changes for founder approval.",
    requiresApproval: true,
    status: "available",
  },
  {
    key: "communication.send",
    provider: "gmail",
    label: "Prepare outbound messages",
    description: "Draft or prepare outbound communication across connected channels.",
    requiresApproval: true,
    status: "available",
  },
  {
    key: "task.create",
    provider: "jira",
    label: "Create operational tasks",
    description: "Prepare tasks or issues in the founder's work management tools.",
    requiresApproval: false,
    status: "available",
  },
  {
    key: "knowledge.search",
    provider: "notion",
    label: "Search company knowledge",
    description: "Search founder and company knowledge sources for relevant context.",
    requiresApproval: false,
    status: "available",
  },
  {
    key: "repository.createIssue",
    provider: "github",
    label: "Create repository issues",
    description: "Prepare engineering issues in connected source control tools.",
    requiresApproval: true,
    status: "available",
  },
] satisfies McpCapability[];

export class CapabilityRegistry {
  public listAvailableCapabilities(): McpCapability[] {
    return DEFAULT_MCP_CAPABILITIES.filter((capability) => capability.status === "available");
  }
}
