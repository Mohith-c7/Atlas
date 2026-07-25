"use client";

import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { approvalsQueryKey } from "@/features/approvals";
import { createCommand } from "../api/commands-api";
import type { CreateCommandRequest, CreateCommandResponse } from "../types/command";

export function useCreateCommand() {
  const queryClient = useQueryClient();

  return useMutation<CreateCommandResponse, Error, CreateCommandRequest>({
    mutationFn: createCommand,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey });
    },
  });
}
