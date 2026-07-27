"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commandExecutionsQueryKey } from "@/features/executions";
import { approveRequest, listApprovals, rejectRequest } from "../api/approvals-api";

export const approvalsQueryKey = ["approvals", "pending"] as const;

export function useApprovals() {
  return useQuery({
    queryFn: listApprovals,
    queryKey: approvalsQueryKey,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey });
      await queryClient.invalidateQueries({ queryKey: commandExecutionsQueryKey });
    },
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey });
      await queryClient.invalidateQueries({ queryKey: commandExecutionsQueryKey });
    },
  });
}
