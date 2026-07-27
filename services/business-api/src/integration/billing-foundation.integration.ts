import Fastify from "fastify";
import { getPrismaClient } from "@faios/database";
import { hashSessionToken } from "@faios/security";
import { billingRoutes } from "../features/billing/index.js";
import { correlationPlugin } from "../lib/correlation.js";
import { founderSessionPlugin } from "../lib/founder-session.js";

const database = getPrismaClient();

type BillingResponse = {
  readonly billing?: {
    readonly planKey?: string;
    readonly status?: string;
    readonly entitlements?: readonly {
      readonly featureKey?: string;
      readonly limit?: number | null;
    }[];
    readonly usage?: readonly {
      readonly featureKey?: string;
      readonly used?: number;
    }[];
  };
};

async function main() {
  const suffix = Date.now().toString(36);
  const founderId = `billing_${suffix}`;
  const rawToken = `faios_billing_session_${suffix}`;
  const planKey = `pro_${suffix}`;
  const featureKey = `commands_${suffix}`;
  const periodStart = new Date("2026-07-01T00:00:00.000Z");
  const periodEnd = new Date("2026-08-01T00:00:00.000Z");
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAuthEnabled = process.env.FAIOS_DEV_AUTH_ENABLED;
  const server = Fastify();

  process.env.APP_ENV = "production";
  process.env.FAIOS_DEV_AUTH_ENABLED = "false";

  await server.register(correlationPlugin);
  await server.register(founderSessionPlugin);
  await server.register(billingRoutes);

  try {
    await database.founderAccount.create({
      data: {
        id: founderId,
        email: `${founderId}@faios.local`,
        billingCustomer: {
          create: {
            provider: "stripe",
            providerCustomerId: `cus_${suffix}`,
            email: `${founderId}@faios.local`,
          },
        },
        subscriptions: {
          create: {
            provider: "stripe",
            providerSubscriptionId: `sub_${suffix}`,
            status: "ACTIVE",
            planKey,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        },
        usageCounters: {
          create: {
            featureKey,
            periodStart,
            periodEnd,
            used: 12,
            limit: 100,
            source: "integration-test",
          },
        },
        sessions: {
          create: {
            tokenHash: hashSessionToken(rawToken),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      },
    });

    await database.planEntitlement.create({
      data: {
        planKey,
        featureKey,
        limit: 100,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/v1/billing/status",
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    });

    if (response.statusCode !== 200) {
      throw new Error(`Expected billing status 200, received ${response.statusCode}.`);
    }

    const payload: BillingResponse = response.json();

    if (payload.billing?.planKey !== planKey || payload.billing.status !== "active") {
      throw new Error("Billing status did not include active subscription state.");
    }

    if (!payload.billing.entitlements?.some((item) => item.featureKey === featureKey)) {
      throw new Error("Billing status did not include plan entitlement.");
    }

    if (
      !payload.billing.usage?.some((item) => item.featureKey === featureKey && item.used === 12)
    ) {
      throw new Error("Billing status did not include founder usage counter.");
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

    await server.close();
    await database.planEntitlement
      .delete({
        where: {
          planKey_featureKey: {
            planKey,
            featureKey,
          },
        },
      })
      .catch(() => undefined);
    await database.founderAccount
      .delete({
        where: {
          id: founderId,
        },
      })
      .catch(() => undefined);
    await database.$disconnect();
  }
}

await main();
