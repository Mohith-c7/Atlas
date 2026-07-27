import type {
  FounderSessionSummary,
  ListFounderSessionsResponse,
  RevokeFounderSessionResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";

type FounderSessionRecord = Awaited<ReturnType<PrismaClient["founderSession"]["findMany"]>>[number];

function toSessionStatus(
  status: FounderSessionRecord["status"],
  expiresAt: Date,
): FounderSessionSummary["status"] {
  if (status === "REVOKED") {
    return "revoked";
  }

  if (status === "EXPIRED" || expiresAt <= new Date()) {
    return "expired";
  }

  return "active";
}

function toSummary(
  session: FounderSessionRecord,
  currentSessionId: string | undefined,
): FounderSessionSummary {
  return {
    id: session.id,
    status: toSessionStatus(session.status, session.expiresAt),
    issuedAt: session.issuedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    userAgent: session.userAgent,
    isCurrent: session.id === currentSessionId,
  };
}

export class ListFounderSessionsUseCase {
  public constructor(private readonly database: PrismaClient) {}

  public async execute(
    founderSession: FounderSession,
    correlationId: string,
  ): Promise<ListFounderSessionsResponse> {
    const sessions = await this.database.founderSession.findMany({
      where: {
        founderId: founderSession.founderId,
      },
      orderBy: {
        issuedAt: "desc",
      },
    });

    return {
      sessions: sessions.map((session) => toSummary(session, founderSession.sessionId)),
      correlationId,
    };
  }
}

export class RevokeFounderSessionUseCase {
  public constructor(private readonly database: PrismaClient) {}

  public async execute(input: {
    founderSession: FounderSession;
    sessionId: string;
    correlationId: string;
    now?: Date;
  }): Promise<RevokeFounderSessionResponse> {
    const now = input.now ?? new Date();
    const result = await this.database.founderSession.updateMany({
      where: {
        id: input.sessionId,
        founderId: input.founderSession.founderId,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });

    if (result.count !== 1) {
      throw new AppError("SESSION_NOT_FOUND", "Founder session was not found.", 404);
    }

    const session = await this.database.founderSession.findUniqueOrThrow({
      where: {
        id: input.sessionId,
      },
    });

    return {
      session: toSummary(session, input.founderSession.sessionId),
      correlationId: input.correlationId,
    };
  }
}
