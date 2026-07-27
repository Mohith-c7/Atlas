"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFounderAccount,
  listFounderSessions,
  revokeFounderSession,
  updateFounderAccount,
} from "../api/account-api";
import type { UpdateFounderAccountRequest } from "../types/account";

export const founderAccountQueryKey = ["founder", "account"] as const;
export const founderSessionsQueryKey = ["founder", "sessions"] as const;

export function useFounderAccount() {
  return useQuery({
    queryFn: getFounderAccount,
    queryKey: founderAccountQueryKey,
    staleTime: 30_000,
  });
}

export function useFounderSessions() {
  return useQuery({
    queryFn: listFounderSessions,
    queryKey: founderSessionsQueryKey,
    staleTime: 30_000,
  });
}

export function useUpdateFounderAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateFounderAccountRequest) => updateFounderAccount(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: founderAccountQueryKey });
    },
  });
}

export function useRevokeFounderSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => revokeFounderSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: founderSessionsQueryKey });
    },
  });
}
