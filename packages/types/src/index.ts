export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type CorrelationId = Brand<string, "CorrelationId">;

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorId?: UserId;
  readonly correlationId: CorrelationId;
}
