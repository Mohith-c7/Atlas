import type {
  CreateBillingCheckoutSessionRequest,
  CreateBillingCheckoutSessionResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { BillingRepository } from "../infrastructure/billing.repository.js";
import { StripeClient } from "../infrastructure/stripe.client.js";

export class CreateCheckoutSessionUseCase {
  private readonly billingRepository: BillingRepository;
  private readonly stripeClient: StripeClient;

  public constructor(database: PrismaClient) {
    this.billingRepository = new BillingRepository(database);
    this.stripeClient = new StripeClient();
  }

  public async execute(
    founderSession: FounderSession,
    input: CreateBillingCheckoutSessionRequest,
    correlationId: string,
  ): Promise<CreateBillingCheckoutSessionResponse> {
    const priceId = this.stripeClient.getPriceId(input.planKey);
    const customer = await this.billingRepository.getOrCreateBillingCustomer({
      founderId: founderSession.founderId,
      email: founderSession.email,
      displayName: founderSession.displayName,
      createProviderCustomer: async () => {
        const stripeCustomer = await this.stripeClient.createCustomer({
          email: founderSession.email,
          founderId: founderSession.founderId,
          name: founderSession.displayName,
        });

        return stripeCustomer.id;
      },
    });
    const session = await this.stripeClient.createCheckoutSession({
      customerId: customer.providerCustomerId,
      priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      founderId: founderSession.founderId,
      planKey: input.planKey,
    });

    if (!session.url) {
      throw new AppError("STRIPE_CHECKOUT_URL_MISSING", "Stripe checkout URL was missing.", 502);
    }

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      correlationId,
    };
  }
}
