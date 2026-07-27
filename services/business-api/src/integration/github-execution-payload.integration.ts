import { getPrismaClient } from "@faios/database";
import { ApprovalRepository } from "../features/approvals/infrastructure/approval.repository.js";
import { CommandRepository } from "../features/commands/infrastructure/command.repository.js";
import { resolveDevelopmentFounder } from "../features/commands/infrastructure/founder-resolver.js";

const database = getPrismaClient();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `github_payload_${suffix}`;
  const issuePayload = {
    title: "Fix onboarding bug",
    body: "Created from founder command:\n\nCreate a GitHub issue for the onboarding bug",
    labels: ["bug", "onboarding"],
  };

  process.env.DEV_FOUNDER_ID = founderId;
  process.env.DEV_FOUNDER_EMAIL = `${founderId}@faios.local`;

  try {
    const founder = await resolveDevelopmentFounder(database);
    const commandRepository = new CommandRepository(database);
    const commandRecord = await commandRepository.createCommandRecord({
      founderId: founder.id,
      input: "Create a GitHub issue for the onboarding bug",
      source: "chat",
      correlationId: `corr_${suffix}`,
    });

    await commandRepository.storePlan({
      commandId: commandRecord.command.id,
      status: "awaiting_approval",
      summary: "Prepared a GitHub issue for founder approval.",
      steps: [
        {
          capability: "repository.createIssue",
          provider: "github",
          requiresApproval: true,
          reason: "Creating an external GitHub issue requires founder approval.",
          executionPayload: issuePayload,
        },
      ],
    });

    const approvalRepository = new ApprovalRepository(database);
    const approvals = await approvalRepository.listPendingApprovals(founder.id);

    if (approvals.length !== 1) {
      throw new Error(`Expected one pending approval, received ${approvals.length}.`);
    }

    const approval = approvals[0];

    if (!approval) {
      throw new Error("Expected pending approval to be present.");
    }

    const approvalPayload = approval.payload;

    if (!isRecord(approvalPayload?.executionPayload)) {
      throw new Error("Expected approval payload to include executionPayload.");
    }

    if (approvalPayload.executionPayload.title !== issuePayload.title) {
      throw new Error("Approval payload did not include the GitHub issue title.");
    }

    const decision = await approvalRepository.decideApproval(founder.id, approval.id, "APPROVED");

    if (!decision || decision.executionJobs.length !== 1) {
      throw new Error("Expected approval decision to enqueue one execution job.");
    }

    const executionJob = decision.executionJobs[0];

    if (!executionJob) {
      throw new Error("Expected execution job to be present.");
    }

    const invocation = await database.toolInvocation.findUniqueOrThrow({
      where: {
        id: executionJob.invocationId,
      },
    });

    if (!isRecord(invocation.requestPayload)) {
      throw new Error("Expected invocation request payload.");
    }

    if (invocation.requestPayload.title !== issuePayload.title) {
      throw new Error("Invocation request payload did not use GitHub issue title.");
    }

    if (JSON.stringify(invocation.requestPayload).includes("commandSummary")) {
      throw new Error("Invocation request payload fell back to generic plan metadata.");
    }
  } finally {
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
