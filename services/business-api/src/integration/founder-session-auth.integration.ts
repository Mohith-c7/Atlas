import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { authRoutes } from "../features/auth/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `auth_session_${suffix}`;
  const email = `${founderId}@faios.local`;
  const rawToken = `faios_test_session_${suffix}`;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "true";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(authRoutes);

  try {
    const unauthenticatedResponse = await server.inject({
      method: "GET",
      url: "/api/v1/auth/session/current",
    });

    if (unauthenticatedResponse.statusCode !== 401) {
      throw new Error(
        `Expected unauthenticated production request to return 401, received ${unauthenticatedResponse.statusCode}.`,
      );
    }

    await database.founderAccount.create({
      data: {
        id: founderId,
        email,
        displayName: "Session Founder",
        authIdentities: {
          create: {
            provider: "test",
            providerSubject: founderId,
            email,
            emailVerified: true,
          },
        },
        sessions: {
          create: {
            tokenHash: hashSessionToken(rawToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            userAgent: "faios-integration-test",
          },
        },
      },
    });

    const authenticatedResponse = await server.inject({
      method: "GET",
      url: "/api/v1/auth/session/current",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (authenticatedResponse.statusCode !== 200) {
      throw new Error(
        `Expected authenticated session request to return 200, received ${authenticatedResponse.statusCode}.`,
      );
    }

    const authenticatedPayload: {
      readonly founder?: {
        readonly id?: string;
      };
      readonly session?: {
        readonly source?: string;
      };
    } = authenticatedResponse.json();

    if (authenticatedPayload.founder?.id !== founderId) {
      throw new Error("Authenticated session resolved the wrong founder.");
    }

    if (authenticatedPayload.session?.source !== "session") {
      throw new Error("Authenticated session did not report session source.");
    }

    const storedSession = await database.founderSession.findUniqueOrThrow({
      where: {
        tokenHash: hashSessionToken(rawToken),
      },
    });

    if (!storedSession.lastSeenAt) {
      throw new Error("Expected authenticated request to update session lastSeenAt.");
    }

    const invalidTokenResponse = await server.inject({
      method: "GET",
      url: "/api/v1/auth/session/current",
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    if (invalidTokenResponse.statusCode !== 401) {
      throw new Error(
        `Expected invalid session request to return 401, received ${invalidTokenResponse.statusCode}.`,
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
          id: founderId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
