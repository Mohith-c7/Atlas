import type {
  ConnectIntegrationResponse,
  GitHubIntegrationConnectionRequest,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class ConnectGitHubIntegrationUseCase {
  private readonly repository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
  }

  public async execute(
    request: GitHubIntegrationConnectionRequest,
    correlationId: string,
    founderSession?: FounderSession,
  ): Promise<ConnectIntegrationResponse> {
    try {
      const founder = await resolveFounderAccount(this.database, founderSession);
      const connection = await this.repository.upsertGitHubConnection(founder.id, request);

      return {
        connection,
        correlationId,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "FAIOS_ENCRYPTION_KEY is required for credential encryption."
      ) {
        throw new AppError(
          "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED",
          "Credential encryption is not configured for integration setup.",
          500,
        );
      }

      throw error;
    }
  }
}
