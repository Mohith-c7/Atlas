import {
  disconnectIntegrationRequestSchema,
  githubIntegrationConnectionRequestSchema,
  integrationProviderSchema,
  rotateGitHubCredentialRequestSchema,
  startGitHubOAuthRequestSchema,
} from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { CompleteGitHubOAuthUseCase } from "../application/complete-github-oauth.use-case.js";
import { ConnectGitHubIntegrationUseCase } from "../application/connect-github-integration.use-case.js";
import { DisconnectIntegrationUseCase } from "../application/disconnect-integration.use-case.js";
import { GetIntegrationProviderStatusUseCase } from "../application/get-integration-provider-status.use-case.js";
import { ListIntegrationCatalogUseCase } from "../application/list-integration-catalog.use-case.js";
import { ListIntegrationConnectionsUseCase } from "../application/list-integration-connections.use-case.js";
import { ReconnectIntegrationUseCase } from "../application/reconnect-integration.use-case.js";
import { RotateGitHubCredentialUseCase } from "../application/rotate-github-credential.use-case.js";
import { StartGitHubOAuthUseCase } from "../application/start-github-oauth.use-case.js";

function getQueryValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const integrationRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.get("/api/v1/integrations/catalog", async (request, reply) => {
    const useCase = new ListIntegrationCatalogUseCase(getPrismaClient());

    try {
      return reply
        .status(200)
        .send(await useCase.execute(request.founderSession, request.correlationId));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list integration catalog",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.get<{ Params: { provider: string } }>(
    "/api/v1/integrations/providers/:provider/status",
    async (request, reply) => {
      const useCase = new GetIntegrationProviderStatusUseCase(getPrismaClient());

      try {
        return reply.status(200).send(
          await useCase.execute({
            founderSession: request.founderSession,
            provider: request.params.provider,
            correlationId: request.correlationId,
          }),
        );
      } catch (error) {
        request.log.error(
          {
            provider: request.params.provider,
            correlationId: request.correlationId,
            error,
          },
          "Failed to get integration provider status",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.get("/api/v1/integrations/connections", async (request, reply) => {
    const useCase = new ListIntegrationConnectionsUseCase(getPrismaClient());

    try {
      return reply
        .status(200)
        .send(await useCase.execute(request.correlationId, request.founderSession));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to list integration connections",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post<{ Params: { provider: string } }>(
    "/api/v1/integrations/:provider/disconnect",
    async (request, reply) => {
      const provider = integrationProviderSchema.safeParse(request.params.provider);
      const parsed = disconnectIntegrationRequestSchema.safeParse(request.body ?? {});

      if (!provider.success) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Invalid integration disconnect request.",
          correlationId: request.correlationId,
          details: provider.error.flatten(),
        });
      }

      if (!parsed.success) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Invalid integration disconnect request.",
          correlationId: request.correlationId,
          details: parsed.error.flatten(),
        });
      }

      const useCase = new DisconnectIntegrationUseCase(getPrismaClient());

      try {
        const response = await useCase.execute({
          provider: provider.data,
          reason: parsed.data.reason,
          correlationId: request.correlationId,
          founderSession: request.founderSession,
        });

        request.log.info(
          {
            connectionId: response.connection.id,
            provider: response.connection.provider,
            correlationId: response.correlationId,
          },
          "Integration connection disconnected",
        );

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            provider: request.params.provider,
            correlationId: request.correlationId,
            error,
          },
          "Failed to disconnect integration",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.post<{ Params: { provider: string } }>(
    "/api/v1/integrations/:provider/reconnect",
    async (request, reply) => {
      const provider = integrationProviderSchema.safeParse(request.params.provider);

      if (!provider.success) {
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Invalid integration provider.",
          correlationId: request.correlationId,
          details: provider.error.flatten(),
        });
      }

      const useCase = new ReconnectIntegrationUseCase(getPrismaClient());

      try {
        const response = await useCase.execute({
          provider: provider.data,
          correlationId: request.correlationId,
          founderSession: request.founderSession,
        });

        request.log.info(
          {
            connectionId: response.connection.id,
            provider: response.connection.provider,
            correlationId: response.correlationId,
          },
          "Integration connection reconnected",
        );

        return reply.status(200).send(response);
      } catch (error) {
        request.log.error(
          {
            provider: request.params.provider,
            correlationId: request.correlationId,
            error,
          },
          "Failed to reconnect integration",
        );

        return sendError(reply, error, request.correlationId);
      }
    },
  );

  server.post("/api/v1/integrations/github/credentials/rotate", async (request, reply) => {
    const parsed = rotateGitHubCredentialRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid GitHub credential rotation request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new RotateGitHubCredentialUseCase(getPrismaClient());

    try {
      const response = await useCase.execute({
        request: parsed.data,
        correlationId: request.correlationId,
        founderSession: request.founderSession,
      });

      request.log.info(
        {
          connectionId: response.connection.id,
          provider: response.connection.provider,
          rotatedAt: response.rotatedAt,
          correlationId: response.correlationId,
        },
        "Integration credential rotated",
      );

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to rotate GitHub credential",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/integrations/github/oauth/start", async (request, reply) => {
    const parsed = startGitHubOAuthRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid GitHub OAuth start request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new StartGitHubOAuthUseCase(getPrismaClient());

    try {
      const response = await useCase.execute(
        parsed.data,
        request.correlationId,
        request.founderSession,
      );

      request.log.info(
        {
          provider: "github",
          expiresAt: response.expiresAt,
          correlationId: response.correlationId,
        },
        "GitHub OAuth authorization started",
      );

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to start GitHub OAuth",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.get("/api/v1/integrations/github/oauth/callback", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const code = getQueryValue(query.code);
    const state = getQueryValue(query.state);

    if (!code || !state) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "GitHub OAuth callback requires code and state.",
        correlationId: request.correlationId,
      });
    }

    const useCase = new CompleteGitHubOAuthUseCase(getPrismaClient());

    try {
      const response = await useCase.execute(
        {
          code,
          state,
        },
        request.correlationId,
        request.founderSession,
      );

      request.log.info(
        {
          connectionId: response.connection.id,
          provider: response.connection.provider,
          correlationId: response.correlationId,
        },
        "GitHub OAuth connection completed",
      );

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to complete GitHub OAuth",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/integrations/github/connections", async (request, reply) => {
    const parsed = githubIntegrationConnectionRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid GitHub integration connection request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new ConnectGitHubIntegrationUseCase(getPrismaClient());

    try {
      const response = await useCase.execute(
        parsed.data,
        request.correlationId,
        request.founderSession,
      );

      request.log.info(
        {
          connectionId: response.connection.id,
          provider: response.connection.provider,
          correlationId: response.correlationId,
        },
        "Integration connection stored",
      );

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to connect GitHub integration",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
