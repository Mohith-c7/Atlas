"use client";

import { useQuery } from "@tanstack/react-query";
import { getBillingStatus } from "../api/billing-api";

export const billingStatusQueryKey = ["billing", "status"] as const;

export function useBillingStatus() {
  return useQuery({
    queryFn: getBillingStatus,
    queryKey: billingStatusQueryKey,
    staleTime: 60_000,
  });
}
