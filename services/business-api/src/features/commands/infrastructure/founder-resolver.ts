import type { PrismaClient } from "@faios/database";

export const resolveDevelopmentFounder = async (database: PrismaClient) => {
  const founderId = process.env.DEV_FOUNDER_ID ?? "dev_founder";
  const founderEmail = process.env.DEV_FOUNDER_EMAIL ?? "founder@faios.local";

  return database.founderAccount.upsert({
    where: { id: founderId },
    create: {
      id: founderId,
      email: founderEmail,
      displayName: "Development Founder",
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
