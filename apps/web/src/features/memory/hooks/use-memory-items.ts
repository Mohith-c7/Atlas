"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMemoryItem,
  exportMemoryItems,
  listMemoryItems,
  updateMemoryItem,
} from "../api/memory-api";
import type { UpdateMemoryItemRequest } from "../types/memory";

export const memoryItemsQueryKey = ["memory", "items"] as const;

export function useMemoryItems() {
  return useQuery({
    queryFn: listMemoryItems,
    queryKey: memoryItemsQueryKey,
    staleTime: 30_000,
  });
}

export function useUpdateMemoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { memoryId: string; patch: UpdateMemoryItemRequest }) =>
      updateMemoryItem(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryItemsQueryKey });
    },
  });
}

export function useDeleteMemoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memoryId: string) => deleteMemoryItem(memoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryItemsQueryKey });
    },
  });
}

export function useExportMemoryItems() {
  return useMutation({
    mutationFn: exportMemoryItems,
  });
}
