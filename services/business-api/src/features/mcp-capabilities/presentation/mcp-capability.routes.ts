import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { ListCapabilitiesUseCase } from "../application/list-capabilities.use-case.js";

export const mcpCapabilityRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/mcp/capabilities", async (request, reply) => {
    const useCase = new ListCapabilitiesUseCase();

    try {
      const response = useCase.execute();
      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list MCP capabilities",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
