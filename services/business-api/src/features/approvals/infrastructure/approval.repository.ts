import type { ApprovalRequest as ApprovalContract, ApprovalStatus } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";

type ApprovalDecision = "APPROVED" | "REJECTED";

const toContractStatus = (status: string): ApprovalStatus => status.toLowerCase() as ApprovalStatus;

const toIsoString = (value: Date) => value.toISOString();

const isApprovalPayload = (value: unknown): value is NonNullable<ApprovalContract["payload"]> =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as { capability?: unknown }).capability === "string" &&
  typeof (value as { reason?: unknown }).reason === "string";

type ApprovalRecord = Awaited<ReturnType<PrismaClient["approvalRequest"]["findMany"]>>[number];

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
  ): Promise<ApprovalContract | undefined> {
    const existing = await this.database.approvalRequest.findFirst({
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
      return toApprovalContract(existing);
    }

    if (existing.status !== "PENDING") {
      return toApprovalContract(existing);
    }

    const updated = await this.database.approvalRequest.update({
      where: {
        id: approvalId,
      },
      data: {
        status: decision,
        resolvedAt: new Date(),
      },
    });

    return toApprovalContract(updated);
  }
}
