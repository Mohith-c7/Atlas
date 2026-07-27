import { getPrismaClient, type PrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

export type FounderSessionSource = "development" | "session";

export type FounderSession = {
  readonly founderId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly source: FounderSessionSource;
  readonly sessionId?: string;
  readonly expiresAt?: Date;
};

declare module "fastify" {
  interface FastifyRequest {
    founderSession: FounderSession;
  }
}

const DEFAULT_DEV_FOUNDER_ID = "dev_founder";
const DEFAULT_DEV_FOUNDER_EMAIL = "founder@faios.local";
const PUBLIC_ROUTE_PREFIXES = ["/health"] as const;

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isProductionEnvironment() {
  return process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
}

function isDevelopmentFounderFallbackEnabled() {
  if (isProductionEnvironment()) {
    return false;
  }

  return process.env.FAIOS_DEV_AUTH_ENABLED !== "false";
}

function isPublicRoute(url: string) {
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

function getBearerToken(authorization: string | string[] | undefined): string | undefined {
  const value = getHeaderValue(authorization);

  if (!value) {
    return undefined;
  }

  const [scheme, token] = value.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
}

export function createDevelopmentFounderSession(): FounderSession {
  return {
    founderId: process.env.DEV_FOUNDER_ID ?? DEFAULT_DEV_FOUNDER_ID,
    email: process.env.DEV_FOUNDER_EMAIL ?? DEFAULT_DEV_FOUNDER_EMAIL,
    displayName: process.env.DEV_FOUNDER_DISPLAY_NAME ?? "Development Founder",
    source: "development",
  };
}

export function createDevelopmentFounderSessionFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): FounderSession | undefined {
  if (!isDevelopmentFounderFallbackEnabled()) {
    return undefined;
  }

  const headerFounderId = getHeaderValue(headers["x-faios-founder-id"]);
  const headerFounderEmail = getHeaderValue(headers["x-faios-founder-email"]);
  const headerFounderName = getHeaderValue(headers["x-faios-founder-name"]);

  if (headerFounderId && headerFounderEmail) {
    return {
      founderId: headerFounderId,
      email: headerFounderEmail,
      displayName: headerFounderName ?? headerFounderEmail,
      source: "development",
    };
  }

  return createDevelopmentFounderSession();
}

export class FounderSessionRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async resolveBearerToken(token: string, now = new Date()): Promise<FounderSession | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.database.founderSession.findFirst({
      where: {
        tokenHash,
        status: "ACTIVE",
        expiresAt: {
          gt: now,
        },
      },
      include: {
        founder: true,
      },
    });

    if (!session) {
      return null;
    }

    await this.database.founderSession.update({
      where: {
        id: session.id,
      },
      data: {
        lastSeenAt: now,
      },
    });

    return {
      founderId: session.founderId,
      email: session.founder.email,
      displayName: session.founder.displayName,
      source: "session",
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }
}

const founderSessionPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  const repository = new FounderSessionRepository(getPrismaClient());

  server.addHook("onRequest", (request, reply, hookDone) => {
    if (isPublicRoute(request.url)) {
      hookDone();
      return;
    }

    void (async () => {
      const bearerToken = getBearerToken(request.headers.authorization);

      if (bearerToken) {
        const session = await repository.resolveBearerToken(bearerToken);

        if (session) {
          request.founderSession = session;
          hookDone();
          return;
        }

        await reply.status(401).send({
          code: "SESSION_INVALID",
          message: "Founder session is invalid or expired.",
          correlationId: request.correlationId,
        });
        return;
      }

      const developmentSession = createDevelopmentFounderSessionFromHeaders(request.headers);

      if (developmentSession) {
        request.founderSession = developmentSession;
        hookDone();
        return;
      }

      await reply.status(401).send({
        code: "SESSION_REQUIRED",
        message: "Founder session is required.",
        correlationId: request.correlationId,
      });
    })().catch((error: unknown) => {
      hookDone(error instanceof Error ? error : new Error("Founder session resolution failed."));
    });
  });

  done();
};

export const founderSessionPlugin = fp(founderSessionPluginCallback, {
  name: "faios-founder-session",
});
