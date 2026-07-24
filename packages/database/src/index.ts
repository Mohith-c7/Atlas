export { getPrismaClient, prisma, createPrismaClient } from "./client.js";
export { Prisma, PrismaClient } from "@prisma/client";

export type DatabaseBoundary = {
  readonly kind: "postgresql";
  readonly orm: "prisma";
};
