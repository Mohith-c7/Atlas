"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveMemoryItem,
  deleteMemoryItem,
  exportMemoryItems,
  importMemoryItems,
  listMemoryItems,
  mergeMemoryItems,
  searchMemoryItems,
  updateMemoryItem,
} from "../api/memory-api";
import type {
  ImportMemoryItemsRequest,
  MergeMemoryItemsRequest,
  SearchMemoryRequest,
  UpdateMemoryItemRequest,
} from "../types/memory";

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

export function useArchiveMemoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memoryId: string) =>
      archiveMemoryItem({
        memoryId,
        request: {
          archived: true,
        },
      }),
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

export function useImportMemoryItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImportMemoryItemsRequest) => importMemoryItems(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryItemsQueryKey });
    },
  });
}

export function useSearchMemoryItems() {
  return useMutation({
    mutationFn: (input: SearchMemoryRequest) => searchMemoryItems(input),
  });
}

export function useMergeMemoryItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MergeMemoryItemsRequest) => mergeMemoryItems(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryItemsQueryKey });
    },
  });
}
