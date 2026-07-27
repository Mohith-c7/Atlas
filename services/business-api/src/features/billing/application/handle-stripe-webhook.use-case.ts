import type { BillingWebhookResponse } from "@faios/contracts";
import type { Prisma, PrismaClient, SubscriptionStatus } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import { BillingRepository } from "../infrastructure/billing.repository.js";
import { verifyStripeWebhookSignature } from "../infrastructure/stripe-signature.js";

type StripeWebhookEvent = {
  readonly id: string;
  readonly type: string;
  readonly data?: {
    readonly object?: Record<string, unknown>;
  };
};

const stripeStatusMap: Record<string, SubscriptionStatus> = {
  incomplete: "INCOMPLETE",
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new AppError(
      "STRIPE_WEBHOOK_NOT_CONFIGURED",
      "Stripe webhook secret is not configured.",
      503,
    );
  }

  return secret;
}

function parseEvent(payload: string): StripeWebhookEvent {
  const parsed = JSON.parse(payload) as unknown;

  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.type !== "string") {
    throw new AppError("STRIPE_WEBHOOK_INVALID", "Stripe webhook payload was invalid.", 400);
  }

  return parsed as StripeWebhookEvent;
}

function secondsToDate(value: unknown): Date | undefined {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function extractPlanKey(subscription: Record<string, unknown>): string {
  const metadata = isRecord(subscription.metadata) ? subscription.metadata : {};
  const planKey = metadata.planKey;

  return typeof planKey === "string" && planKey.length > 0 ? planKey : "unknown";
}

function extractProviderCustomerId(object: Record<string, unknown>): string | undefined {
  const customer = object.customer;

  return typeof customer === "string" ? customer : undefined;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class HandleStripeWebhookUseCase {
  private readonly billingRepository: BillingRepository;

  public constructor(database: PrismaClient) {
    this.billingRepository = new BillingRepository(database);
  }

  public async execute(input: {
    readonly payload: string;
    readonly signatureHeader: string | undefined;
  }): Promise<BillingWebhookResponse> {
    const signatureHeader = input.signatureHeader;

    if (!signatureHeader) {
      throw new AppError("STRIPE_WEBHOOK_SIGNATURE_REQUIRED", "Stripe signature is required.", 400);
    }

    const signatureIsValid = verifyStripeWebhookSignature({
      payload: input.payload,
      signatureHeader,
      secret: getWebhookSecret(),
    });

    if (!signatureIsValid) {
      throw new AppError("STRIPE_WEBHOOK_SIGNATURE_INVALID", "Stripe signature is invalid.", 400);
    }

    const event = parseEvent(input.payload);
    const object = event.data?.object;
    const providerCustomerId = object ? extractProviderCustomerId(object) : undefined;

    await this.billingRepository.recordWebhookEvent({
      providerEventId: event.id,
      eventType: event.type,
      providerCustomerId,
      payload: toInputJsonValue(JSON.parse(input.payload) as unknown),
      process: async () => {
        if (!object || !event.type.startsWith("customer.subscription.")) {
          return;
        }

        const providerSubscriptionId = object.id;
        const status =
          typeof object.status === "string" ? stripeStatusMap[object.status] : undefined;

        if (typeof providerSubscriptionId !== "string" || !providerCustomerId || !status) {
          return;
        }

        await this.billingRepository.syncStripeSubscription({
          providerCustomerId,
          providerSubscriptionId,
          status,
          planKey: extractPlanKey(object),
          currentPeriodStart: secondsToDate(object.current_period_start),
          currentPeriodEnd: secondsToDate(object.current_period_end),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          trialEndsAt: secondsToDate(object.trial_end),
          metadata: toInputJsonValue(object.metadata ?? {}),
        });
      },
    });

    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
    };
  }
}
