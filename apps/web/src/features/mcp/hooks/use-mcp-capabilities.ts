"use client";

import { useQuery } from "@tanstack/react-query";

import { listMcpCapabilities } from "../api/capabilities-api";

export function useMcpCapabilities() {
  return useQuery({
    queryFn: listMcpCapabilities,
    queryKey: ["mcp", "capabilities"],
    staleTime: 30_000,
  });
}
