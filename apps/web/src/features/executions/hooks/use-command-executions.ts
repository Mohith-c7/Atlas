"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXECUTIONS_EVENTS_ENDPOINT,
  listCommandExecutions,
  normalizeExecutionSnapshotEvent,
} from "../api/executions-api";
import type { ListCommandExecutionsResponse } from "../types/execution";

export const commandExecutionsQueryKey = ["commands", "executions"] as const;

export function useCommandExecutions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return undefined;
    }

    const eventSource = new EventSource(EXECUTIONS_EVENTS_ENDPOINT);

    eventSource.addEventListener("command.execution.snapshot", (message: MessageEvent) => {
      if (typeof message.data !== "string") {
        return;
      }

      const event = normalizeExecutionSnapshotEvent(JSON.parse(message.data) as unknown);

      if (!event) {
        return;
      }

      queryClient.setQueryData<ListCommandExecutionsResponse>(commandExecutionsQueryKey, {
        executions: event.executions,
      });
    });

    return () => {
      eventSource.close();
    };
  }, [queryClient]);

  return useQuery({
    queryFn: listCommandExecutions,
    queryKey: commandExecutionsQueryKey,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}
