import type { CommandStatus, CommandSource, ExecutionStep } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { toPrismaCommandStatus } from "../domain/command-status.js";

type CreateCommandRecordInput = {
  founderId: string;
  conversationId?: string;
  input: string;
  source: CommandSource;
  correlationId: string;
};

type StorePlanInput = {
  commandId: string;
  summary: string;
  status: CommandStatus;
  steps: ExecutionStep[];
};

type FailCommandInput = {
  commandId: string;
  code: string;
  message: string;
};

export class CommandRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async createCommandRecord(input: CreateCommandRecordInput) {
    return this.database.$transaction(async (transaction) => {
      const conversation = input.conversationId
        ? await transaction.conversation.findFirstOrThrow({
            where: {
              id: input.conversationId,
              founderId: input.founderId,
            },
          })
        : await transaction.conversation.create({
            data: {
              founderId: input.founderId,
              channel: input.source.toUpperCase() as "CHAT" | "VOICE",
              title: input.input.slice(0, 80),
            },
          });

      const message = await transaction.message.create({
        data: {
          conversationId: conversation.id,
          role: "FOUNDER",
          content: input.input,
          metadata: {
            correlationId: input.correlationId,
          },
        },
      });

      const command = await transaction.command.create({
        data: {
          founderId: input.founderId,
          conversationId: conversation.id,
          messageId: message.id,
          source: input.source.toUpperCase() as "CHAT" | "VOICE",
          rawInput: input.input,
          status: "PLANNING",
        },
      });

      return {
        conversation,
        message,
        command,
      };
    });
  }

  public async storePlan(input: StorePlanInput) {
    return this.database.$transaction(async (transaction) => {
      const approvalRequiredSteps = input.steps.filter((step) => step.requiresApproval);
      const commandStatus = approvalRequiredSteps.length > 0 ? "awaiting_approval" : input.status;

      const plan = await transaction.executionPlan.create({
        data: {
          commandId: input.commandId,
          summary: input.summary,
          steps: input.steps,
        },
      });

      if (approvalRequiredSteps.length > 0) {
        await transaction.approvalRequest.createMany({
          data: approvalRequiredSteps.map((step) => ({
            commandId: input.commandId,
            reason: step.reason,
            status: "PENDING",
            payload: {
              capability: step.capability,
              provider: step.provider,
              reason: step.reason,
              commandSummary: input.summary,
            },
          })),
        });
      }

      const command = await transaction.command.update({
        where: { id: input.commandId },
        data: {
          status: toPrismaCommandStatus(commandStatus),
          summary: input.summary,
        },
      });

      return {
        command,
        plan,
      };
    });
  }

  public async failCommand(input: FailCommandInput) {
    return this.database.command.update({
      where: { id: input.commandId },
      data: {
        status: "FAILED",
        errorCode: input.code,
        errorMessage: input.message,
      },
    });
  }
}
