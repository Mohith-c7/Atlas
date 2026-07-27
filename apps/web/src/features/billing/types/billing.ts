import type { GetBillingStatusResponse } from "@faios/contracts";

export type {
  BillingStatus,
  CreateBillingCheckoutSessionRequest,
  CreateBillingCheckoutSessionResponse,
  CreateBillingPortalSessionRequest,
  CreateBillingPortalSessionResponse,
  GetBillingStatusResponse,
} from "@faios/contracts";

export type BillingApiErrorResponse = {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
};

export class BillingApiError extends Error {
  public constructor(
    public readonly input: {
      readonly code: string;
      readonly message: string;
      readonly correlationId?: string;
      readonly statusCode: number;
    },
  ) {
    super(input.message);
  }

  public get code() {
    return this.input.code;
  }

  public get correlationId() {
    return this.input.correlationId;
  }

  public get statusCode() {
    return this.input.statusCode;
  }
}

export type BillingStatusResponse = GetBillingStatusResponse;
