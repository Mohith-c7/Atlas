import {
  executionStepSchema,
  type ExecutionJob,
  type ApprovalRequest as ApprovalContract,
  type ApprovalStatus,
} from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";

type ApprovalDecision = "APPROVED" | "REJECTED";

type ApprovalDecisionResult = {
  approval: ApprovalContract;
  executionJobs: ExecutionJob[];
};

const toContractStatus = (status: string): ApprovalStatus => status.toLowerCase() as ApprovalStatus;

const toIsoString = (value: Date) => value.toISOString();

const isApprovalPayload = (value: unknown): value is NonNullable<ApprovalContract["payload"]> =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as { capability?: unknown }).capability === "string" &&
  typeof (value as { reason?: unknown }).reason === "string";

type ApprovalRecord = Awaited<ReturnType<PrismaClient["approvalRequest"]["findMany"]>>[number];
type ApprovalTransaction = Prisma.TransactionClient;

const toApprovalContract = (approval: ApprovalRecord): ApprovalContract => ({
  id: approval.id,
  commandId: approval.commandId,
  status: toContractStatus(approval.status),
  reason: approval.reason,
  payload: isApprovalPayload(approval.payload) ? approval.payload : undefined,
  requestedAt: toIsoString(approval.requestedAt),
  resolvedAt: approval.resolvedAt ? toIsoString(approval.resolvedAt) : null,
});

export class ApprovalRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async listPendingApprovals(founderId: string): Promise<ApprovalContract[]> {
    const approvals = await this.database.approvalRequest.findMany({
      where: {
        status: "PENDING",
        command: {
          founderId,
        },
      },
      orderBy: {
        requestedAt: "desc",
      },
    });

    return approvals.map(toApprovalContract);
  }

  public async decideApproval(
    founderId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalDecisionResult | undefined> {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.approvalRequest.findFirst({
        where: {
          id: approvalId,
          command: {
            founderId,
          },
        },
      });

      if (!existing) {
        return undefined;
      }

      if (existing.status === decision) {
        return {
          approval: toApprovalContract(existing),
          executionJobs: [],
        };
      }

      if (existing.status !== "PENDING") {
        return {
          approval: toApprovalContract(existing),
          executionJobs: [],
        };
      }

      const updated = await transaction.approvalRequest.update({
        where: {
          id: approvalId,
        },
        data: {
          status: decision,
          resolvedAt: new Date(),
        },
      });

      if (decision === "REJECTED") {
        await transaction.command.update({
          where: {
            id: existing.commandId,
          },
          data: {
            status: "CANCELLED",
          },
        });
        return {
          approval: toApprovalContract(updated),
          executionJobs: [],
        };
      } else {
        const executionJobs = await this.enqueueCommandInvocationsIfReady(
          transaction,
          founderId,
          existing.commandId,
        );

        return {
          approval: toApprovalContract(updated),
          executionJobs,
        };
      }
    });
  }

  private async enqueueCommandInvocationsIfReady(
    transaction: ApprovalTransaction,
    founderId: string,
    commandId: string,
  ): Promise<ExecutionJob[]> {
    const command = await transaction.command.findFirst({
      where: {
        id: commandId,
        founderId,
      },
      include: {
        approvals: true,
        invocations: true,
        plan: true,
      },
    });

    if (!command?.plan || command.invocations.length > 0) {
      return [];
    }

    const hasOpenApproval = command.approvals.some((approval) => approval.status === "PENDING");
    const hasRejectedApproval = command.approvals.some(
      (approval) => approval.status === "REJECTED",
    );

    if (hasOpenApproval || hasRejectedApproval) {
      return [];
    }

    const parsedSteps = executionStepSchema.array().safeParse(command.plan.steps);

    if (!parsedSteps.success || parsedSteps.data.length === 0) {
      await transaction.command.update({
        where: {
          id: commandId,
        },
        data: {
          status: "FAILED",
          errorCode: "INVALID_EXECUTION_PLAN",
          errorMessage: "Execution plan did not contain executable steps.",
        },
      });
      return [];
    }

    const invocations = await Promise.all(
      parsedSteps.data.map((step) =>
        transaction.toolInvocation.create({
          data: {
            commandId,
            capabilityKey: step.capability,
            provider: step.provider ?? null,
            status: "PENDING",
            maxRetries: 3,
            requestPayload: {
              capability: step.capability,
              provider: step.provider,
              reason: step.reason,
              requiresApproval: step.requiresApproval,
              commandSummary: command.summary,
              planId: command.plan?.id,
            },
          },
        }),
      ),
    );

    await transaction.command.update({
      where: {
        id: commandId,
      },
      data: {
        status: "EXECUTING",
      },
    });

    return invocations.map((invocation) => ({
      invocationId: invocation.id,
      commandId: invocation.commandId,
      founderId,
      capabilityKey: invocation.capabilityKey,
      provider: invocation.provider,
      requestPayload: invocation.requestPayload ?? undefined,
    }));
  }
}
