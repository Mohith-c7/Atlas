"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeGitHubOAuth,
  connectGitHubIntegration,
  disconnectIntegration,
  getIntegrationProviderStatus,
  listIntegrationCatalog,
  listIntegrationConnections,
  reconnectIntegration,
  rotateGitHubCredential,
  startGitHubOAuth,
  testIntegrationConnection,
} from "../api/integrations-api";
import type {
  ConnectGitHubIntegrationRequest,
  RotateGitHubCredentialRequest,
  StartGitHubOAuthRequest,
} from "../types/integration";

async function invalidateIntegrationState(
  queryClient: ReturnType<typeof useQueryClient>,
  provider?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["integrations", "connections"] }),
    queryClient.invalidateQueries({ queryKey: ["integrations", "catalog"] }),
    provider
      ? queryClient.invalidateQueries({
          queryKey: ["integrations", "providers", provider, "status"],
        })
      : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: ["mcp", "capabilities"] }),
  ]);
}

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
      await invalidateIntegrationState(queryClient, "github");
    },
  });
}

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, reason }: { provider: string; reason?: string }) =>
      disconnectIntegration(provider, reason),
    onSuccess: async (response) => {
      await invalidateIntegrationState(queryClient, response.connection.provider);
    },
  });
}

export function useReconnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => reconnectIntegration(provider),
    onSuccess: async (response) => {
      await invalidateIntegrationState(queryClient, response.connection.provider);
    },
  });
}

export function useRotateGitHubCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: RotateGitHubCredentialRequest) => rotateGitHubCredential(request),
    onSuccess: async () => {
      await invalidateIntegrationState(queryClient, "github");
    },
  });
}

export function useTestIntegrationConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => testIntegrationConnection(provider),
    onSuccess: async (response) => {
      await invalidateIntegrationState(queryClient, response.provider.provider);
    },
  });
}

export function useStartGitHubOAuth() {
  return useMutation({
    mutationFn: (request: StartGitHubOAuthRequest) => startGitHubOAuth(request),
  });
}

export function useCompleteGitHubOAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: { code: string; state: string }) => completeGitHubOAuth(request),
    onSuccess: async () => {
      await invalidateIntegrationState(queryClient, "github");
    },
  });
}
