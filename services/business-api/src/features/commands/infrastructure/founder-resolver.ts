import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";

export const resolveFounderAccount = async (
  database: PrismaClient,
  founderSession?: FounderSession,
) => {
  if (founderSession?.source === "session") {
    const founder = await database.founderAccount.findUnique({
      where: {
        id: founderSession.founderId,
      },
    });

    if (!founder) {
      throw new AppError("FOUNDER_NOT_FOUND", "Authenticated founder account was not found.", 401);
    }

    return founder;
  }

  const founderId = founderSession?.founderId ?? process.env.DEV_FOUNDER_ID ?? "dev_founder";
  const founderEmail =
    founderSession?.email ?? process.env.DEV_FOUNDER_EMAIL ?? "founder@faios.local";
  const displayName = founderSession?.displayName ?? "Development Founder";

  return database.founderAccount.upsert({
    where: { id: founderId },
    create: {
      id: founderId,
      email: founderEmail,
      displayName,
      profile: {
        create: {
          timezone: process.env.DEV_FOUNDER_TIMEZONE ?? "UTC",
          locale: "en-US",
          operatingStyle: "Fast, concise, approval-first execution",
        },
      },
      companyProfile: {
        create: {
          name: process.env.DEV_COMPANY_NAME ?? "FAIOS Development Company",
          stage: "MVP",
          description: "Local development founder context for command pipeline testing.",
        },
      },
    },
    update: {},
  });
};

export const resolveDevelopmentFounder = async (database: PrismaClient) =>
  resolveFounderAccount(database);
