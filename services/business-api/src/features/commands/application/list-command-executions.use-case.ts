import type { ListCommandExecutionsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { CommandExecutionRepository } from "../infrastructure/command-execution.repository.js";
import { resolveDevelopmentFounder } from "../infrastructure/founder-resolver.js";

const DEFAULT_LIMIT = 10;

export class ListCommandExecutionsUseCase {
  private readonly repository: CommandExecutionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new CommandExecutionRepository(database);
  }

  public async execute(): Promise<ListCommandExecutionsResponse> {
    const founder = await resolveDevelopmentFounder(this.database);
    const executions = await this.repository.listRecentExecutions(founder.id, DEFAULT_LIMIT);

    return { executions };
  }
}
