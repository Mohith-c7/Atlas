import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { billingRoutes } from "../features/billing/index.js";
import { createStripeSignature } from "../features/billing/infrastructure/stripe-signature.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type StripeRequest = {
  readonly url: string;
  readonly body: string;
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startStripeServer(): Promise<{
  readonly baseUrl: string;
  readonly requests: StripeRequest[];
  readonly close: () => Promise<void>;
}> {
  const requests: StripeRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const body = await readBody(request);
      requests.push({
        url: request.url ?? "",
        body,
      });

      response.writeHead(200, {
        "content-type": "application/json",
      });

      if (request.url === "/v1/customers") {
        response.end(JSON.stringify({ id: "cus_test_founder" }));
        return;
      }

      if (request.url === "/v1/checkout/sessions") {
        response.end(
          JSON.stringify({
            id: "cs_test_founder",
            url: "https://checkout.stripe.test/cs_test_founder",
          }),
        );
        return;
      }

      if (request.url === "/v1/billing_portal/sessions") {
        response.end(
          JSON.stringify({
            id: "bps_test_founder",
            url: "https://billing.stripe.test/bps_test_founder",
          }),
        );
        return;
      }

      response.writeHead(404);
      response.end();
    })().catch(() => {
      response.writeHead(500);
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected fake Stripe server to bind to a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `stripe_boundary_${suffix}`;
  const rawToken = `faios_stripe_session_${suffix}`;
  const webhookSecret = `whsec_${suffix}`;
  const stripeServer = await startStripeServer();
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousStripeApiBaseUrl = process.env.STRIPE_API_BASE_URL;
  const previousStripePricePro = process.env.STRIPE_PRICE_PRO;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";
  process.env.STRIPE_SECRET_KEY = "sk_test_boundary";
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  process.env.STRIPE_API_BASE_URL = stripeServer.baseUrl;
  process.env.STRIPE_PRICE_PRO = "price_test_pro";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(billingRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderId,
        email: `${founderId}@faios.local`,
        displayName: "Stripe Founder",
        sessions: {
          create: {
            tokenHash: hashSessionToken(rawToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });

    const checkoutResponse = await server.inject({
      method: "POST",
      url: "/api/v1/billing/checkout/sessions",
      headers: {
        authorization: `Bearer ${rawToken}`,
        "content-type": "application/json",
      },
      payload: {
        planKey: "pro",
        successUrl: "https://app.faios.test/billing/success",
        cancelUrl: "https://app.faios.test/billing/cancel",
      },
    });

    if (checkoutResponse.statusCode !== 201) {
      throw new Error(`Expected checkout session 201, received ${checkoutResponse.statusCode}.`);
    }

    if (!checkoutResponse.body.includes("https://checkout.stripe.test/cs_test_founder")) {
      throw new Error("Checkout response did not include Stripe checkout URL.");
    }

    const customer = await database.billingCustomer.findUniqueOrThrow({
      where: {
        founderId,
      },
    });

    if (customer.providerCustomerId !== "cus_test_founder") {
      throw new Error("Stripe customer was not persisted.");
    }

    const portalResponse = await server.inject({
      method: "POST",
      url: "/api/v1/billing/portal/sessions",
      headers: {
        authorization: `Bearer ${rawToken}`,
        "content-type": "application/json",
      },
      payload: {
        returnUrl: "https://app.faios.test/settings",
      },
    });

    if (portalResponse.statusCode !== 201) {
      throw new Error(`Expected portal session 201, received ${portalResponse.statusCode}.`);
    }

    const webhookPayload = JSON.stringify({
      id: `evt_${suffix}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_${suffix}`,
          customer: "cus_test_founder",
          status: "active",
          current_period_start: 1782864000,
          current_period_end: 1785542400,
          cancel_at_period_end: false,
          metadata: {
            planKey: "pro",
          },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createStripeSignature({
      payload: webhookPayload,
      secret: webhookSecret,
      timestamp,
    });

    const webhookResponse = await server.inject({
      method: "POST",
      url: "/api/v1/billing/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      payload: webhookPayload,
    });

    if (webhookResponse.statusCode !== 200) {
      throw new Error(`Expected webhook 200, received ${webhookResponse.statusCode}.`);
    }

    const replayResponse = await server.inject({
      method: "POST",
      url: "/api/v1/billing/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      payload: webhookPayload,
    });

    if (replayResponse.statusCode !== 200) {
      throw new Error(`Expected webhook replay 200, received ${replayResponse.statusCode}.`);
    }

    const subscription = await database.subscription.findUniqueOrThrow({
      where: {
        providerSubscriptionId: `sub_${suffix}`,
      },
    });

    if (subscription.status !== "ACTIVE" || subscription.planKey !== "pro") {
      throw new Error("Stripe webhook did not sync active subscription.");
    }

    const webhookEvents = await database.billingWebhookEvent.findMany({
      where: {
        providerEventId: `evt_${suffix}`,
      },
    });

    if (webhookEvents.length !== 1 || webhookEvents[0]?.status !== "processed") {
      throw new Error("Stripe webhook event was not processed idempotently.");
    }

    const badSignatureResponse = await server.inject({
      method: "POST",
      url: "/api/v1/billing/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=bad`,
      },
      payload: webhookPayload,
    });

    if (badSignatureResponse.statusCode !== 400) {
      throw new Error(
        `Expected bad webhook signature 400, received ${badSignatureResponse.statusCode}.`,
      );
    }
  } finally {
    if (previousAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = previousAppEnv;
    }

    if (previousDevAuthEnabled === undefined) {
      delete process.env.FAIOS_DEV_AUTH_ENABLED;
    } else {
      process.env.FAIOS_DEV_AUTH_ENABLED = previousDevAuthEnabled;
    }

    if (previousStripeSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }

    if (previousStripeWebhookSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = previousStripeWebhookSecret;
    }

    if (previousStripeApiBaseUrl === undefined) {
      delete process.env.STRIPE_API_BASE_URL;
    } else {
      process.env.STRIPE_API_BASE_URL = previousStripeApiBaseUrl;
    }

    if (previousStripePricePro === undefined) {
      delete process.env.STRIPE_PRICE_PRO;
    } else {
      process.env.STRIPE_PRICE_PRO = previousStripePricePro;
    }

    await server.close();
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await stripeServer.close();
    await database.$disconnect();
  }
}

await main();
