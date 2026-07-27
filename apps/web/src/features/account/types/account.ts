import type {
  FounderAccount,
  FounderSessionSummary,
  GetFounderAccountResponse,
  ListFounderSessionsResponse,
  RevokeFounderSessionResponse,
  UpdateFounderAccountRequest,
} from "@faios/contracts";

export type {
  FounderAccount,
  FounderSessionSummary,
  GetFounderAccountResponse,
  ListFounderSessionsResponse,
  RevokeFounderSessionResponse,
  UpdateFounderAccountRequest,
};

export type AccountApiErrorResponse = {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
};

export class AccountApiError extends Error {
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
