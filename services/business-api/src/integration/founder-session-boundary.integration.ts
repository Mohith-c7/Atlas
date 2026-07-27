import { getPrismaClient } from "@faios/database";
import { ConnectGitHubIntegrationUseCase } from "../features/integrations/application/connect-github-integration.use-case.js";
import { ListIntegrationConnectionsUseCase } from "../features/integrations/application/list-integration-connections.use-case.js";
import { CommandRepository } from "../features/commands/infrastructure/command.repository.js";
import { resolveFounderAccount } from "../features/commands/infrastructure/founder-resolver.js";
import type { FounderSession } from "../lib/founder-session.js";

const database = getPrismaClient();

async function main() {
  const suffix = Date.now().toString(36);
  const founderA: FounderSession = {
    founderId: `founder_a_${suffix}`,
    email: `founder-a-${suffix}@faios.local`,
    displayName: "Founder A",
    source: "header",
  };
  const founderB: FounderSession = {
    founderId: `founder_b_${suffix}`,
    email: `founder-b-${suffix}@faios.local`,
    displayName: "Founder B",
    source: "header",
  };

  process.env.FAIOS_ENCRYPTION_KEY = Buffer.alloc(32, "founder-session-test").toString("base64");
  process.env.FAIOS_ENCRYPTION_KEY_VERSION = "founder-session-test-v1";

  try {
    await new ConnectGitHubIntegrationUseCase(database).execute(
      {
        accountLabel: "Founder A GitHub",
        owner: "faios-a",
        repo: "atlas-a",
        accessToken: `ghp_founder_a_${suffix}`,
        apiBaseUrl: "https://api.github.com",
      },
      `corr_connect_a_${suffix}`,
      founderA,
    );

    const founderAConnections = await new ListIntegrationConnectionsUseCase(database).execute(
      `corr_list_a_${suffix}`,
      founderA,
    );
    const founderBConnections = await new ListIntegrationConnectionsUseCase(database).execute(
      `corr_list_b_${suffix}`,
      founderB,
    );

    if (founderAConnections.connections.length !== 1) {
      throw new Error("Expected Founder A to see one GitHub connection.");
    }

    if (founderBConnections.connections.length !== 0) {
      throw new Error("Expected Founder B to see no Founder A connections.");
    }

    const founderBAccount = await resolveFounderAccount(database, founderB);
    const commandRecord = await new CommandRepository(database).createCommandRecord({
      founderId: founderBAccount.id,
      input: "Create a GitHub issue for founder identity boundary",
      source: "chat",
      correlationId: `corr_command_b_${suffix}`,
    });

    const command = await database.command.findUniqueOrThrow({
      where: {
        id: commandRecord.command.id,
      },
    });

    if (command.founderId !== founderB.founderId) {
      throw new Error("Command was not scoped to the supplied founder session.");
    }
  } finally {
    await database.founderAccount
      .delete({ where: { id: founderA.founderId } })
      .catch(() => undefined);
    await database.founderAccount
      .delete({ where: { id: founderB.founderId } })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
