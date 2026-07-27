import type {
  CommandExecutionTimelineItem,
  CommandStatus,
  ToolInvocation,
  ToolInvocationStatus,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";

const toContractCommandStatus = (status: string): CommandStatus =>
  status.toLowerCase() as CommandStatus;

const toContractInvocationStatus = (status: string): ToolInvocationStatus =>
  status.toLowerCase() as ToolInvocationStatus;

const toIsoString = (value: Date) => value.toISOString();

type CommandExecutionRecord = Awaited<ReturnType<PrismaClient["command"]["findMany"]>>[number] & {
  invocations: Array<{
    id: string;
    commandId: string;
    capabilityKey: string;
    provider: string | null;
    status: string;
    requestPayload: unknown;
    responsePayload: unknown;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
};

const toToolInvocationContract = (
  invocation: CommandExecutionRecord["invocations"][number],
): ToolInvocation => ({
  id: invocation.id,
  commandId: invocation.commandId,
  capabilityKey: invocation.capabilityKey,
  provider: invocation.provider,
  status: toContractInvocationStatus(invocation.status),
  requestPayload: invocation.requestPayload ?? undefined,
  responsePayload: invocation.responsePayload ?? undefined,
  errorCode: invocation.errorCode,
  errorMessage: invocation.errorMessage,
  startedAt: invocation.startedAt ? toIsoString(invocation.startedAt) : null,
  completedAt: invocation.completedAt ? toIsoString(invocation.completedAt) : null,
  createdAt: toIsoString(invocation.createdAt),
});

const toTimelineItemContract = (command: CommandExecutionRecord): CommandExecutionTimelineItem => ({
  commandId: command.id,
  status: toContractCommandStatus(command.status),
  summary: command.summary,
  rawInput: command.rawInput,
  createdAt: toIsoString(command.createdAt),
  updatedAt: toIsoString(command.updatedAt),
  invocations: command.invocations.map(toToolInvocationContract),
});

export class CommandExecutionRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async listRecentExecutions(
    founderId: string,
    limit: number,
  ): Promise<CommandExecutionTimelineItem[]> {
    const commands = await this.database.command.findMany({
      where: {
        founderId,
        status: {
          in: ["AWAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "CANCELLED"],
        },
      },
      include: {
        invocations: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: limit,
    });

    return commands.map(toTimelineItemContract);
  }
}
