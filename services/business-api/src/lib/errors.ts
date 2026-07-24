import type { FastifyReply } from "fastify";

export class AppError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const sendError = (reply: FastifyReply, error: unknown, correlationId: string) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
      correlationId,
      details: error.details,
    });
  }

  return reply.status(500).send({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    correlationId,
  });
};
