import type {
  RotateGitHubCredentialRequest,
  RotateIntegrationCredentialResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { resolveFounderAccount } from "../../commands/infrastructure/founder-resolver.js";
import { IntegrationConnectionRepository } from "../infrastructure/integration-connection.repository.js";

export class RotateGitHubCredentialUseCase {
  private readonly repository: IntegrationConnectionRepository;

  public constructor(private readonly database: PrismaClient) {
    this.repository = new IntegrationConnectionRepository(database);
  }

  public async execute(input: {
    readonly request: RotateGitHubCredentialRequest;
    readonly correlationId: string;
    readonly founderSession?: FounderSession;
  }): Promise<RotateIntegrationCredentialResponse> {
    try {
      const founder = await resolveFounderAccount(this.database, input.founderSession);
      const result = await this.repository.rotateGitHubCredential({
        founderId: founder.id,
        request: input.request,
        reason: input.request.reason,
      });

      return {
        connection: result.connection,
        rotatedAt: result.rotatedAt.toISOString(),
        correlationId: input.correlationId,
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
