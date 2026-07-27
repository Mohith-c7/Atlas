import type { ExecutionJob } from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";
import { redactSensitivePayload } from "@faios/mcp";

type ExecutionTransaction = Prisma.TransactionClient;

export class ExecutionRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async claimNextPendingInvocation(): Promise<ExecutionJob | undefined> {
    return this.claimPendingInvocation();
  }

  public async claimPendingInvocationById(invocationId: string): Promise<ExecutionJob | undefined> {
    return this.claimPendingInvocation(invocationId);
  }

  private async claimPendingInvocation(invocationId?: string): Promise<ExecutionJob | undefined> {
    return this.database.$transaction(async (transaction) => {
      const invocation = await transaction.toolInvocation.findFirst({
        where: {
          ...(invocationId ? { id: invocationId } : {}),
          status: "PENDING",
          OR: [
            {
              nextAttemptAt: null,
            },
            {
              nextAttemptAt: {
                lte: new Date(),
              },
            },
          ],
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          command: {
            select: {
              founderId: true,
            },
          },
        },
      });

      if (!invocation) {
        return undefined;
      }

      const claim = await transaction.toolInvocation.updateMany({
        where: {
          id: invocation.id,
          status: "PENDING",
        },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          nextAttemptAt: null,
        },
      });

      if (claim.count !== 1) {
        return undefined;
      }

      return {
        invocationId: invocation.id,
        commandId: invocation.commandId,
        founderId: invocation.command.founderId,
        capabilityKey: invocation.capabilityKey,
        provider: invocation.provider,
        requestPayload: redactSensitivePayload(invocation.requestPayload ?? undefined),
      };
    });
  }

  public async markInvocationSucceeded(
    invocationId: string,
    responsePayload?: unknown,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const invocation = await transaction.toolInvocation.update({
        where: {
          id: invocationId,
        },
        data: {
          status: "SUCCEEDED",
          ...(responsePayload === undefined
            ? {}
            : {
                responsePayload: redactSensitivePayload(responsePayload) as Prisma.InputJsonValue,
              }),
          completedAt: new Date(),
        },
      });

      await this.refreshCommandStatus(transaction, invocation.commandId);
    });
  }

  public async markInvocationFailed(
    invocationId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const invocation = await transaction.toolInvocation.update({
        where: {
          id: invocationId,
        },
        data: {
          status: "FAILED",
          errorCode,
          errorMessage,
          completedAt: new Date(),
        },
      });

      await this.refreshCommandStatus(transaction, invocation.commandId);
    });
  }

  public async scheduleInvocationRetry(
    invocationId: string,
    errorCode: string,
    errorMessage: string,
    retryCount: number,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.database.toolInvocation.update({
      where: {
        id: invocationId,
      },
      data: {
        status: "PENDING",
        errorCode,
        errorMessage,
        retryCount,
        nextAttemptAt,
        completedAt: null,
      },
    });
  }

  public async getInvocationRetryState(
    invocationId: string,
  ): Promise<{ retryCount: number; maxRetries: number } | undefined> {
    const invocation = await this.database.toolInvocation.findUnique({
      where: {
        id: invocationId,
      },
      select: {
        retryCount: true,
        maxRetries: true,
      },
    });

    return invocation ?? undefined;
  }

  private async refreshCommandStatus(
    transaction: ExecutionTransaction,
    commandId: string,
  ): Promise<void> {
    const invocations = await transaction.toolInvocation.findMany({
      where: {
        commandId,
      },
      select: {
        status: true,
      },
    });

    if (invocations.some((invocation) => ["PENDING", "RUNNING"].includes(invocation.status))) {
      return;
    }

    const hasFailure = invocations.some((invocation) => invocation.status === "FAILED");
    const allSucceeded =
      invocations.length > 0 &&
      invocations.every((invocation) => invocation.status === "SUCCEEDED");

    if (hasFailure) {
      await transaction.command.update({
        where: {
          id: commandId,
        },
        data: {
          status: "FAILED",
          errorCode: "TOOL_INVOCATION_FAILED",
          errorMessage: "One or more tool invocations failed.",
        },
      });
      return;
    }

    if (allSucceeded) {
      await transaction.command.update({
        where: {
          id: commandId,
        },
        data: {
          status: "COMPLETED",
        },
      });
    }
  }
}
