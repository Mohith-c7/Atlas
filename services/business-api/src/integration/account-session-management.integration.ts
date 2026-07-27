import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { accountRoutes } from "../features/account/index.js";
import { authRoutes } from "../features/auth/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type AccountResponse = {
  readonly account?: {
    readonly id?: string;
    readonly displayName?: string | null;
    readonly profile?: {
      readonly timezone?: string | null;
    };
    readonly companyProfile?: {
      readonly name?: string | null;
    };
  };
};

type SessionsResponse = {
  readonly sessions?: readonly {
    readonly id: string;
    readonly status: string;
    readonly isCurrent: boolean;
  }[];
};

async function main() {
  const suffix = Date.now().toString(36);
  const founderAId = `account_a_${suffix}`;
  const founderBId = `account_b_${suffix}`;
  const founderAToken = `faios_account_session_a_${suffix}`;
  const founderBToken = `faios_account_session_b_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(authRoutes);
  await server.register(accountRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderAId,
        email: `${founderAId}@faios.local`,
        displayName: "Founder A",
        profile: {
          create: {
            timezone: "UTC",
            locale: "en-US",
          },
        },
        companyProfile: {
          create: {
            name: "Founder A Company",
          },
        },
        sessions: {
          create: {
            tokenHash: hashSessionToken(founderAToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            userAgent: "founder-a-browser",
          },
        },
      },
    });

    await database.founderAccount.create({
      data: {
        id: founderBId,
        email: `${founderBId}@faios.local`,
        displayName: "Founder B",
        sessions: {
          create: {
            tokenHash: hashSessionToken(founderBToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            userAgent: "founder-b-browser",
          },
        },
      },
    });

    const founderBSession = await database.founderSession.findFirstOrThrow({
      where: {
        founderId: founderBId,
      },
    });

    const accountResponse = await server.inject({
      method: "GET",
      url: "/api/v1/account",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (accountResponse.statusCode !== 200) {
      throw new Error(`Expected account read 200, received ${accountResponse.statusCode}.`);
    }

    const accountPayload: AccountResponse = accountResponse.json();

    if (accountPayload.account?.id !== founderAId) {
      throw new Error("Account read returned the wrong founder.");
    }

    const updateResponse = await server.inject({
      method: "PATCH",
      url: "/api/v1/account",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
      payload: {
        displayName: "Updated Founder A",
        profile: {
          timezone: "Asia/Calcutta",
        },
        companyProfile: {
          name: "Updated Atlas Company",
        },
      },
    });

    if (updateResponse.statusCode !== 200) {
      throw new Error(`Expected account update 200, received ${updateResponse.statusCode}.`);
    }

    const updatedPayload: AccountResponse = updateResponse.json();

    if (updatedPayload.account?.displayName !== "Updated Founder A") {
      throw new Error("Account display name was not updated.");
    }

    if (updatedPayload.account.profile?.timezone !== "Asia/Calcutta") {
      throw new Error("Founder timezone was not updated.");
    }

    if (updatedPayload.account.companyProfile?.name !== "Updated Atlas Company") {
      throw new Error("Company profile name was not updated.");
    }

    const sessionsResponse = await server.inject({
      method: "GET",
      url: "/api/v1/auth/sessions",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (sessionsResponse.statusCode !== 200) {
      throw new Error(`Expected session list 200, received ${sessionsResponse.statusCode}.`);
    }

    const sessionsPayload: SessionsResponse = sessionsResponse.json();
    const currentSession = sessionsPayload.sessions?.find((session) => session.isCurrent);

    if (!currentSession) {
      throw new Error("Expected current founder session in session list.");
    }

    if (sessionsPayload.sessions?.some((session) => session.id === founderBSession.id)) {
      throw new Error("Founder A session list included Founder B session.");
    }

    const crossFounderRevokeResponse = await server.inject({
      method: "DELETE",
      url: `/api/v1/auth/sessions/${founderBSession.id}`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (crossFounderRevokeResponse.statusCode !== 404) {
      throw new Error(
        `Expected cross-founder session revoke 404, received ${crossFounderRevokeResponse.statusCode}.`,
      );
    }

    const revokeResponse = await server.inject({
      method: "DELETE",
      url: `/api/v1/auth/sessions/${currentSession.id}`,
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (revokeResponse.statusCode !== 200) {
      throw new Error(`Expected session revoke 200, received ${revokeResponse.statusCode}.`);
    }

    const revokedSession = await database.founderSession.findUniqueOrThrow({
      where: {
        id: currentSession.id,
      },
    });

    if (revokedSession.status !== "REVOKED" || !revokedSession.revokedAt) {
      throw new Error("Expected current session to be revoked.");
    }

    const revokedTokenResponse = await server.inject({
      method: "GET",
      url: "/api/v1/account",
      headers: {
        authorization: `Bearer ${founderAToken}`,
      },
    });

    if (revokedTokenResponse.statusCode !== 401) {
      throw new Error(
        `Expected revoked token to return 401, received ${revokedTokenResponse.statusCode}.`,
      );
    }
  } finally {
    if (previousAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = previousAppEnv;
    }

    if (previousDevAuthEnabled === undefined) {
      delete process.env.FAIOS_DEV_AUTH_ENABLED;
    } else {
      process.env.FAIOS_DEV_AUTH_ENABLED = previousDevAuthEnabled;
    }

    await server.close();
    await database.founderAccount
      .delete({
        where: {
          id: founderAId,
        },
      })
      .catch(() => undefined);
    await database.founderAccount
      .delete({
        where: {
          id: founderBId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
