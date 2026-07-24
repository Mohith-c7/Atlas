"use client";

import { useMutation } from "@tanstack/react-query";

import { createCommand } from "../api/commands-api";
import type { CreateCommandRequest, CreateCommandResponse } from "../types/command";

export function useCreateCommand() {
  return useMutation<CreateCommandResponse, Error, CreateCommandRequest>({
    mutationFn: createCommand,
  });
}
