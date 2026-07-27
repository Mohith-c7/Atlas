import type { CreateCommandRequest, CreateCommandResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { extractMemoryCandidates, MemoryRepository } from "../../memory/index.js";
import { MemoryVectorSyncService } from "../../memory/infrastructure/memory-vector-sync.service.js";
import { CapabilityRegistry } from "../../mcp-capabilities/index.js";
import { AiOrchestratorClient } from "../infrastructure/ai-orchestrator.client.js";
import { CommandRepository } from "../infrastructure/command.repository.js";
import { resolveFounderAccount } from "../infrastructure/founder-resolver.js";

const MEMORY_CONTEXT_LIMIT = 8;

type CreateCommandUseCaseInput = {
  request: CreateCommandRequest;
  correlationId: string;
  founderSession?: FounderSession;
};

export class CreateCommandUseCase {
  private readonly repository: CommandRepository;
  private readonly memoryRepository: MemoryRepository;
  private readonly aiOrchestrator: AiOrchestratorClient;
  private readonly capabilityRegistry: CapabilityRegistry;
  private readonly memoryVectorSync: MemoryVectorSyncService;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new CommandRepository(database);
    this.memoryRepository = new MemoryRepository(database);
    this.aiOrchestrator = new AiOrchestratorClient();
    this.capabilityRegistry = new CapabilityRegistry();
    this.memoryVectorSync = new MemoryVectorSyncService(database);
  }

  public async execute(input: CreateCommandUseCaseInput): Promise<CreateCommandResponse> {
    const founder = await resolveFounderAccount(this.database, input.founderSession);
    const record = await this.repository.createCommandRecord({
      founderId: founder.id,
      conversationId: input.request.conversationId,
      input: input.request.input,
      source: input.request.source,
      correlationId: input.correlationId,
    });

    try {
      const memoryCandidates = extractMemoryCandidates(input.request.input);

      const createdMemories = await Promise.all(
        memoryCandidates.map((candidate) =>
          this.memoryRepository.createMemoryItem({
            founderId: founder.id,
            kind: candidate.kind,
            content: candidate.content,
            source: candidate.source,
            confidence: candidate.confidence,
            metadata: {
              commandId: record.command.id,
              correlationId: input.correlationId,
            },
          }),
        ),
      );
      await this.memoryVectorSync.scheduleUpsert(founder.id, createdMemories);

      const memoryContext = await this.memoryRepository.listRecentMemoryContext(
        founder.id,
        MEMORY_CONTEXT_LIMIT,
      );
      const availableCapabilities = this.capabilityRegistry.listAvailableCapabilities();
      const plan = await this.aiOrchestrator.planCommand({
        commandId: record.command.id,
        founderId: founder.id,
        conversationId: record.conversation.id,
        source: input.request.source,
        input: input.request.input,
        correlationId: input.correlationId,
        availableCapabilities,
        memoryContext,
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
