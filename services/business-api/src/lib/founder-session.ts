import type { FastifyPluginCallback } from "fastify";

export type FounderSessionSource = "development" | "header";

export type FounderSession = {
  readonly founderId: string;
  readonly email: string;
  readonly displayName: string;
  readonly source: FounderSessionSource;
};

declare module "fastify" {
  interface FastifyRequest {
    founderSession: FounderSession;
  }
}

const DEFAULT_DEV_FOUNDER_ID = "dev_founder";
const DEFAULT_DEV_FOUNDER_EMAIL = "founder@faios.local";

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function createDevelopmentFounderSession(): FounderSession {
  return {
    founderId: process.env.DEV_FOUNDER_ID ?? DEFAULT_DEV_FOUNDER_ID,
    email: process.env.DEV_FOUNDER_EMAIL ?? DEFAULT_DEV_FOUNDER_EMAIL,
    displayName: process.env.DEV_FOUNDER_DISPLAY_NAME ?? "Development Founder",
    source: "development",
  };
}

export function createFounderSessionFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): FounderSession {
  const headerFounderId = getHeaderValue(headers["x-faios-founder-id"]);
  const headerFounderEmail = getHeaderValue(headers["x-faios-founder-email"]);
  const headerFounderName = getHeaderValue(headers["x-faios-founder-name"]);

  if (headerFounderId && headerFounderEmail) {
    return {
      founderId: headerFounderId,
      email: headerFounderEmail,
      displayName: headerFounderName ?? headerFounderEmail,
      source: "header",
    };
  }

  return createDevelopmentFounderSession();
}

export const founderSessionPlugin: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", (request, _reply, hookDone) => {
    request.founderSession = createFounderSessionFromHeaders(request.headers);
    hookDone();
  });

  done();
};
