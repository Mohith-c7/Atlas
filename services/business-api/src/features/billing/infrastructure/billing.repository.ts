import type {
  BillingStatus,
  BillingSubscriptionStatus,
  PlanEntitlement,
  UsageCounter,
} from "@faios/contracts";
import type { Prisma, PrismaClient, SubscriptionStatus } from "@faios/database";

function toSubscriptionStatus(status: string | undefined): BillingSubscriptionStatus {
  switch (status) {
    case "INCOMPLETE":
      return "incomplete";
    case "TRIALING":
      return "trialing";
    case "ACTIVE":
      return "active";
    case "PAST_DUE":
      return "past_due";
    case "CANCELED":
      return "canceled";
    case "UNPAID":
      return "unpaid";
    default:
      return "none";
  }
}

export class BillingRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async getOrCreateBillingCustomer(input: {
    readonly founderId: string;
    readonly email: string;
    readonly displayName?: string | null;
    readonly createProviderCustomer: () => Promise<string>;
  }): Promise<{
    readonly id: string;
    readonly providerCustomerId: string;
  }> {
    const existing = await this.database.billingCustomer.findUnique({
      where: {
        founderId: input.founderId,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        providerCustomerId: existing.providerCustomerId,
      };
    }

    const providerCustomerId = await input.createProviderCustomer();
    const customer = await this.database.billingCustomer.create({
      data: {
        founderId: input.founderId,
        provider: "stripe",
        providerCustomerId,
        email: input.email,
        metadata: {
          displayName: input.displayName,
        },
      },
    });

    return {
      id: customer.id,
      providerCustomerId: customer.providerCustomerId,
    };
  }

  public async getBillingCustomer(founderId: string): Promise<{
    readonly id: string;
    readonly providerCustomerId: string;
  } | null> {
    const customer = await this.database.billingCustomer.findUnique({
      where: {
        founderId,
      },
    });

    return customer
      ? {
          id: customer.id,
          providerCustomerId: customer.providerCustomerId,
        }
      : null;
  }

  public async recordWebhookEvent(input: {
    readonly providerEventId: string;
    readonly eventType: string;
    readonly payload: Prisma.InputJsonValue;
    readonly providerCustomerId?: string;
    readonly process: () => Promise<void>;
  }): Promise<"processed" | "duplicate"> {
    const existingEvent = await this.database.billingWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: "stripe",
          providerEventId: input.providerEventId,
        },
      },
    });

    if (existingEvent) {
      return "duplicate";
    }

    const customer = input.providerCustomerId
      ? await this.database.billingCustomer.findUnique({
          where: {
            providerCustomerId: input.providerCustomerId,
          },
        })
      : null;

    try {
      await this.database.billingWebhookEvent.create({
        data: {
          provider: "stripe",
          providerEventId: input.providerEventId,
          billingCustomerId: customer?.id,
          eventType: input.eventType,
          status: "processing",
          payload: input.payload,
        },
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
        return "duplicate";
      }

      throw error;
    }

    await input.process();

    await this.database.billingWebhookEvent.update({
      where: {
        provider_providerEventId: {
          provider: "stripe",
          providerEventId: input.providerEventId,
        },
      },
      data: {
        status: "processed",
        processedAt: new Date(),
      },
    });

    return "processed";
  }

  public async syncStripeSubscription(input: {
    readonly providerCustomerId: string;
    readonly providerSubscriptionId: string;
    readonly status: SubscriptionStatus;
    readonly planKey: string;
    readonly currentPeriodStart?: Date;
    readonly currentPeriodEnd?: Date;
    readonly cancelAtPeriodEnd?: boolean;
    readonly trialEndsAt?: Date;
    readonly metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    const customer = await this.database.billingCustomer.findUnique({
      where: {
        providerCustomerId: input.providerCustomerId,
      },
    });

    if (!customer) {
      return;
    }

    await this.database.subscription.upsert({
      where: {
        providerSubscriptionId: input.providerSubscriptionId,
      },
      create: {
        founderId: customer.founderId,
        billingCustomerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: input.providerSubscriptionId,
        status: input.status,
        planKey: input.planKey,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        trialEndsAt: input.trialEndsAt,
        metadata: input.metadata,
      },
      update: {
        billingCustomerId: customer.id,
        status: input.status,
        planKey: input.planKey,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        trialEndsAt: input.trialEndsAt,
        metadata: input.metadata,
      },
    });
  }

  public async getBillingStatus(founderId: string): Promise<BillingStatus> {
    const subscription = await this.database.subscription.findFirst({
      where: {
        founderId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    const planKey = subscription?.planKey ?? "free";
    const [entitlements, usage] = await Promise.all([
      this.database.planEntitlement.findMany({
        where: {
          planKey,
        },
        orderBy: {
          featureKey: "asc",
        },
      }),
      this.database.usageCounter.findMany({
        where: {
          founderId,
        },
        orderBy: {
          periodEnd: "desc",
        },
      }),
    ]);

    return {
      planKey,
      status: toSubscriptionStatus(subscription?.status),
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      entitlements: entitlements.map((entitlement): PlanEntitlement => ({
        planKey: entitlement.planKey,
        featureKey: entitlement.featureKey,
        enabled: entitlement.enabled,
        limit: entitlement.limit,
      })),
      usage: usage.map((counter): UsageCounter => ({
        featureKey: counter.featureKey,
        periodStart: counter.periodStart.toISOString(),
        periodEnd: counter.periodEnd.toISOString(),
        used: counter.used,
        limit: counter.limit,
      })),
    };
  }
}
