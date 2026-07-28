import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { accountRoutes } from "../features/account/index.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

async function findLatestAuditEvent(input: {
  readonly action: string;
  readonly founderId: string;
}) {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    const auditEvent = await database.auditEvent.findFirst({
      where: input,
      orderBy: {
        createdAt: "desc",
      },
    });

    if (auditEvent) {
      return auditEvent;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `audit_founder_${suffix}`;
  const token = `audit_session_${suffix}`;
  const server = Fastify({ logger: false });
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(accountRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderId,
        email: `${founderId}@faios.local`,
        displayName: "Audit Founder",
        sessions: {
          create: {
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            tokenHash: hashSessionToken(token),
            userAgent: "audit-test-browser",
          },
        },
      },
    });

    const response = await server.inject({
      method: "PATCH",
      url: "/api/v1/account",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "audit-integration-agent",
        "x-correlation-id": `corr_audit_${suffix}`,
      },
      payload: {
        displayName: "Audited Founder",
        profile: {
          approvalSettings: {
            apiKey: "sk-test-secret-value-for-redaction",
            mode: "manual",
          },
        },
      },
    });

    if (response.statusCode !== 200) {
      throw new Error(`Expected account update to succeed, received ${response.statusCode}.`);
    }

    const auditEvent = await findLatestAuditEvent({
      action: "account.update",
      founderId,
    });

    if (!auditEvent) {
      throw new Error("Expected account update audit event to be persisted.");
    }

    if (auditEvent.correlationId !== `corr_audit_${suffix}`) {
      throw new Error("Audit event did not preserve the request correlation id.");
    }

    if (auditEvent.userAgent !== "audit-integration-agent") {
      throw new Error("Audit event did not capture request user agent.");
    }

    await recordAuditEvent(database, {
      action: "memory.write",
      actorType: "system",
      founderId,
      correlationId: `corr_audit_secret_${suffix}`,
      metadata: {
        nested: {
          apiKey: "sk-test-secret-value-for-redaction",
        },
      },
    });

    const redactedAuditEvent = await database.auditEvent.findFirstOrThrow({
      where: {
        correlationId: `corr_audit_secret_${suffix}`,
      },
    });

    if (
      JSON.stringify(redactedAuditEvent.metadata).includes("sk-test-secret-value-for-redaction")
    ) {
      throw new Error("Audit metadata was not redacted before persistence.");
    }
  } finally {
    process.env.APP_ENV = previousAppEnv;
    process.env.FAIOS_DEV_AUTH_ENABLED = previousDevAuthEnabled;
    await server.close();
    await database.founderAccount.delete({ where: { id: founderId } }).catch(() => undefined);
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
