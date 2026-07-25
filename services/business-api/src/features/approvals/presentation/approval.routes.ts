import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { DecideApprovalUseCase } from "../application/decide-approval.use-case.js";
import { ListApprovalsUseCase } from "../application/list-approvals.use-case.js";

const approvalIdParamsSchema = {
  type: "object",
  required: ["approvalId"],
  properties: {
    approvalId: { type: "string", minLength: 1 },
  },
} as const;

type ApprovalIdParams = {
  approvalId: string;
};

export const approvalRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/approvals", async (request, reply) => {
    const useCase = new ListApprovalsUseCase(getPrismaClient());

    try {
      return reply.status(200).send(await useCase.execute());
    } catch (error) {
      request.log.error(
        { correlationId: request.correlationId, error },
        "Failed to list approvals",
      );
      return sendError(reply, error, request.correlationId);
    }
  });

  server.post<{ Params: ApprovalIdParams }>(
    "/api/v1/approvals/:approvalId/approve",
    { schema: { params: approvalIdParamsSchema } },
    async (request, reply) => {
      const useCase = new DecideApprovalUseCase(getPrismaClient());

      try {
        const response = await useCase.execute(request.params.approvalId, "APPROVED");
        request.log.info(
          {
            approvalId: response.approval.id,
            commandId: response.approval.commandId,
            correlationId: request.correlationId,
          },
          "Approval request approved",
        );
        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          { correlationId: request.correlationId, error },
          "Failed to approve request",
        );
        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.post<{ Params: ApprovalIdParams }>(
    "/api/v1/approvals/:approvalId/reject",
    { schema: { params: approvalIdParamsSchema } },
    async (request, reply) => {
      const useCase = new DecideApprovalUseCase(getPrismaClient());

      try {
        const response = await useCase.execute(request.params.approvalId, "REJECTED");
        request.log.info(
          {
            approvalId: response.approval.id,
            commandId: response.approval.commandId,
            correlationId: request.correlationId,
          },
          "Approval request rejected",
        );
        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          { correlationId: request.correlationId, error },
          "Failed to reject request",
        );
        return sendError(reply, error, request.correlationId);
      }
    },
  );

  done();
};
