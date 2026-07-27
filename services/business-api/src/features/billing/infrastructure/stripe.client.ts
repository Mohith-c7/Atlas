import { AppError } from "../../../lib/errors.js";

type StripeCustomer = {
  readonly id: string;
};

type StripeSession = {
  readonly id: string;
  readonly url?: string | null;
};

type CreateCheckoutSessionInput = {
  readonly customerId: string;
  readonly priceId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly founderId: string;
  readonly planKey: string;
};

type CreatePortalSessionInput = {
  readonly customerId: string;
  readonly returnUrl: string;
};

function getStripeApiBaseUrl() {
  return process.env.STRIPE_API_BASE_URL ?? "https://api.stripe.com";
}

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new AppError("STRIPE_NOT_CONFIGURED", "Stripe secret key is not configured.", 503);
  }

  return secretKey;
}

function getStripePriceId(planKey: string) {
  const normalizedPlanKey = planKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const priceId = process.env[`STRIPE_PRICE_${normalizedPlanKey}`];

  if (!priceId) {
    throw new AppError("BILLING_PLAN_NOT_CONFIGURED", "Billing plan is not configured.", 400, {
      planKey,
    });
  }

  return priceId;
}

async function readStripeJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseStripeCustomer(payload: unknown): StripeCustomer {
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new AppError("STRIPE_RESPONSE_INVALID", "Stripe customer response was invalid.", 502);
  }

  return {
    id: payload.id,
  };
}

function parseStripeSession(payload: unknown, errorCode: string): StripeSession {
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new AppError(errorCode, "Stripe session response was invalid.", 502);
  }

  return {
    id: payload.id,
    url: typeof payload.url === "string" || payload.url === null ? payload.url : undefined,
  };
}

export class StripeClient {
  private readonly apiBaseUrl = getStripeApiBaseUrl();
  private readonly secretKey = getStripeSecretKey();

  public getPriceId(planKey: string) {
    return getStripePriceId(planKey);
  }

  public async createCustomer(input: {
    readonly email: string;
    readonly founderId: string;
    readonly name?: string | null;
  }): Promise<StripeCustomer> {
    const body = new URLSearchParams({
      email: input.email,
      "metadata[founderId]": input.founderId,
    });

    if (input.name) {
      body.set("name", input.name);
    }

    const response = await fetch(`${this.apiBaseUrl}/v1/customers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await readStripeJson(response);

    if (!response.ok) {
      throw new AppError("STRIPE_CUSTOMER_CREATE_FAILED", "Unable to create Stripe customer.", 502);
    }

    return parseStripeCustomer(payload);
  }

  public async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<StripeSession> {
    const body = new URLSearchParams({
      customer: input.customerId,
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": "1",
      "metadata[founderId]": input.founderId,
      "metadata[planKey]": input.planKey,
      "subscription_data[metadata][founderId]": input.founderId,
      "subscription_data[metadata][planKey]": input.planKey,
    });
    const response = await fetch(`${this.apiBaseUrl}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await readStripeJson(response);

    if (!response.ok) {
      throw new AppError(
        "STRIPE_CHECKOUT_CREATE_FAILED",
        "Unable to create checkout session.",
        502,
      );
    }

    return parseStripeSession(payload, "STRIPE_CHECKOUT_RESPONSE_INVALID");
  }

  public async createPortalSession(input: CreatePortalSessionInput): Promise<StripeSession> {
    const body = new URLSearchParams({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    const response = await fetch(`${this.apiBaseUrl}/v1/billing_portal/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await readStripeJson(response);

    if (!response.ok) {
      throw new AppError(
        "STRIPE_PORTAL_CREATE_FAILED",
        "Unable to create billing portal session.",
        502,
      );
    }

    return parseStripeSession(payload, "STRIPE_PORTAL_RESPONSE_INVALID");
  }
}
