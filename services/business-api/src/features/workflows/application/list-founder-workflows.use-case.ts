import type { ListFounderWorkflowsResponse } from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { WorkflowCatalog } from "../infrastructure/workflow-catalog.js";

export class ListFounderWorkflowsUseCase {
  private readonly catalog: WorkflowCatalog;

  public constructor(private readonly database: PrismaClient) {
    this.catalog = new WorkflowCatalog(database);
  }

  public async execute(
    correlationId: string,
    founderSession?: FounderSession,
  ): Promise<ListFounderWorkflowsResponse> {
    const founder = await resolveFounderAccount(this.database, founderSession);
    const workflows = await this.catalog.listFounderWorkflows(founder.id);

    return {
      workflows,
      correlationId,
    };
  }
}
