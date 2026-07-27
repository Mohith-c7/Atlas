"use client";

import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  getBillingStatus,
} from "../api/billing-api";
import type {
  CreateBillingCheckoutSessionRequest,
  CreateBillingPortalSessionRequest,
} from "../types/billing";

export const billingStatusQueryKey = ["billing", "status"] as const;

export function useBillingStatus() {
  return useQuery({
    queryFn: getBillingStatus,
    queryKey: billingStatusQueryKey,
    staleTime: 60_000,
  });
}

export function useCreateBillingCheckoutSession() {
  return useMutation({
    mutationFn: (request: CreateBillingCheckoutSessionRequest) =>
      createBillingCheckoutSession(request),
  });
}

export function useCreateBillingPortalSession() {
  return useMutation({
    mutationFn: (request: CreateBillingPortalSessionRequest) => createBillingPortalSession(request),
  });
}
