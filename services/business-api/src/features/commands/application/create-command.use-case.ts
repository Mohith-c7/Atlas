import type { CreateCommandRequest, CreateCommandResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import { AiOrchestratorClient } from "../infrastructure/ai-orchestrator.client.js";
import { CommandRepository } from "../infrastructure/command.repository.js";
import { resolveDevelopmentFounder } from "../infrastructure/founder-resolver.js";

type CreateCommandUseCaseInput = {
  request: CreateCommandRequest;
  correlationId: string;
};

export class CreateCommandUseCase {
  private readonly repository: CommandRepository;
  private readonly aiOrchestrator: AiOrchestratorClient;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new CommandRepository(database);
    this.aiOrchestrator = new AiOrchestratorClient();
  }

  public async execute(input: CreateCommandUseCaseInput): Promise<CreateCommandResponse> {
    const founder = await resolveDevelopmentFounder(this.database);
    const record = await this.repository.createCommandRecord({
      founderId: founder.id,
      conversationId: input.request.conversationId,
      input: input.request.input,
      source: input.request.source,
      correlationId: input.correlationId,
    });

    try {
      const plan = await this.aiOrchestrator.planCommand({
        commandId: record.command.id,
        founderId: founder.id,
        conversationId: record.conversation.id,
        source: input.request.source,
        input: input.request.input,
        correlationId: input.correlationId,
      });

      await this.repository.storePlan({
        commandId: record.command.id,
        summary: plan.summary,
        status: plan.status,
        steps: plan.steps,
      });

      return {
        commandId: record.command.id,
        conversationId: record.conversation.id,
        status: plan.status,
        summary: plan.summary,
        steps: plan.steps,
        correlationId: input.correlationId,
      };
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError("COMMAND_PLANNING_FAILED", "Unable to create a plan for this command.");

      await this.repository.failCommand({
        commandId: record.command.id,
        code: appError.code,
        message: appError.message,
      });

      throw appError;
    }
  }
}
