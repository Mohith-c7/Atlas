import type {
  BillingStatus,
  BillingSubscriptionStatus,
  PlanEntitlement,
  UsageCounter,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";

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
