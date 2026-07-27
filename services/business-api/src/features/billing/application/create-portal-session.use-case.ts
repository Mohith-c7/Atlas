import type {
  CreateBillingPortalSessionRequest,
  CreateBillingPortalSessionResponse,
} from "@faios/contracts";
import type { PrismaClient } from "@faios/database";
import { AppError } from "../../../lib/errors.js";
import type { FounderSession } from "../../../lib/founder-session.js";
import { BillingRepository } from "../infrastructure/billing.repository.js";
import { StripeClient } from "../infrastructure/stripe.client.js";

export class CreatePortalSessionUseCase {
  private readonly billingRepository: BillingRepository;
  private readonly stripeClient: StripeClient;

  public constructor(database: PrismaClient) {
    this.billingRepository = new BillingRepository(database);
    this.stripeClient = new StripeClient();
  }

  public async execute(
    founderSession: FounderSession,
    input: CreateBillingPortalSessionRequest,
    correlationId: string,
  ): Promise<CreateBillingPortalSessionResponse> {
    const customer = await this.billingRepository.getBillingCustomer(founderSession.founderId);

    if (!customer) {
      throw new AppError("BILLING_CUSTOMER_NOT_FOUND", "Billing customer does not exist yet.", 404);
    }

    const session = await this.stripeClient.createPortalSession({
      customerId: customer.providerCustomerId,
      returnUrl: input.returnUrl,
    });

    if (!session.url) {
      throw new AppError(
        "STRIPE_PORTAL_URL_MISSING",
        "Stripe billing portal URL was missing.",
        502,
      );
    }

    return {
      portalUrl: session.url,
      sessionId: session.id,
      correlationId,
    };
  }
}
