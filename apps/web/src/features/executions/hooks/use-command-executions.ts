"use client";

import { useQuery } from "@tanstack/react-query";
import { listCommandExecutions } from "../api/executions-api";

export const commandExecutionsQueryKey = ["commands", "executions"] as const;

export function useCommandExecutions() {
  return useQuery({
    queryFn: listCommandExecutions,
    queryKey: commandExecutionsQueryKey,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}
