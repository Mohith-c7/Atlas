import {
  createBillingCheckoutSessionRequestSchema,
  createBillingPortalSessionRequestSchema,
} from "@faios/contracts";
import { getPrismaClient } from "@faios/database";
import type { FastifyPluginCallback } from "fastify";
import { sendError } from "../../../lib/errors.js";
import { CreateCheckoutSessionUseCase } from "../application/create-checkout-session.use-case.js";
import { CreatePortalSessionUseCase } from "../application/create-portal-session.use-case.js";
import { GetBillingStatusUseCase } from "../application/get-billing-status.use-case.js";
import { HandleStripeWebhookUseCase } from "../application/handle-stripe-webhook.use-case.js";

function readJsonBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return body;
  }

  return JSON.parse(body) as unknown;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const billingRoutes: FastifyPluginCallback = (server, _options, done) => {
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, doneParser) => {
      doneParser(null, body);
    },
  );

  server.get("/api/v1/billing/status", async (request, reply) => {
    const useCase = new GetBillingStatusUseCase(getPrismaClient());

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
        "Failed to get billing status",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/billing/checkout/sessions", async (request, reply) => {
    const parsed = createBillingCheckoutSessionRequestSchema.safeParse(readJsonBody(request.body));

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid billing checkout session request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new CreateCheckoutSessionUseCase(getPrismaClient());

    try {
      return reply
        .status(201)
        .send(await useCase.execute(request.founderSession, parsed.data, request.correlationId));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to create billing checkout session",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/billing/portal/sessions", async (request, reply) => {
    const parsed = createBillingPortalSessionRequestSchema.safeParse(readJsonBody(request.body));

    if (!parsed.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid billing portal session request.",
        correlationId: request.correlationId,
        details: parsed.error.flatten(),
      });
    }

    const useCase = new CreatePortalSessionUseCase(getPrismaClient());

    try {
      return reply
        .status(201)
        .send(await useCase.execute(request.founderSession, parsed.data, request.correlationId));
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to create billing portal session",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  server.post("/api/v1/billing/stripe/webhook", async (request, reply) => {
    const useCase = new HandleStripeWebhookUseCase(getPrismaClient());

    try {
      const payload =
        typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      const response = await useCase.execute({
        payload,
        signatureHeader: getHeaderValue(request.headers["stripe-signature"]),
      });

      return reply.status(200).send(response);
    } catch (error) {
      request.log.error(
        {
          correlationId: request.correlationId,
          error,
        },
        "Failed to process Stripe webhook",
      );

      return sendError(reply, error, request.correlationId);
    }
  });

  done();
};
