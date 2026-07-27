"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectGitHubIntegration,
  getIntegrationProviderStatus,
  listIntegrationCatalog,
  listIntegrationConnections,
  startGitHubOAuth,
} from "../api/integrations-api";
import type {
  ConnectGitHubIntegrationRequest,
  StartGitHubOAuthRequest,
} from "../types/integration";

export function useIntegrationConnections() {
  return useQuery({
    queryFn: listIntegrationConnections,
    queryKey: ["integrations", "connections"],
    staleTime: 30_000,
  });
}

export function useIntegrationCatalog() {
  return useQuery({
    queryFn: listIntegrationCatalog,
    queryKey: ["integrations", "catalog"],
    staleTime: 30_000,
  });
}

export function useIntegrationProviderStatus(provider: string) {
  return useQuery({
    enabled: provider.length > 0,
    queryFn: () => getIntegrationProviderStatus(provider),
    queryKey: ["integrations", "providers", provider, "status"],
    staleTime: 30_000,
  });
}

export function useConnectGitHubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ConnectGitHubIntegrationRequest) => connectGitHubIntegration(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integrations", "connections"] });
      await queryClient.invalidateQueries({ queryKey: ["mcp", "capabilities"] });
    },
  });
}

export function useStartGitHubOAuth() {
  return useMutation({
    mutationFn: (request: StartGitHubOAuthRequest) => startGitHubOAuth(request),
  });
}
