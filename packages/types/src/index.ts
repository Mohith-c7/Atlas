export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type FounderId = Brand<string, "FounderId">;
export type UserId = Brand<string, "UserId">;
export type CompanyId = Brand<string, "CompanyId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type CommandId = Brand<string, "CommandId">;

export interface FounderContext {
  readonly founderId: FounderId;
  readonly companyId?: CompanyId;
  readonly correlationId: CorrelationId;
  readonly commandId?: CommandId;
}
