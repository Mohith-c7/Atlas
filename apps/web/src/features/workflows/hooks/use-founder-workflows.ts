import { useQuery } from "@tanstack/react-query";
import { listFounderWorkflows } from "../api/workflows-api";

export function useFounderWorkflows() {
  return useQuery({
    queryKey: ["founder-workflows"],
    queryFn: listFounderWorkflows,
    staleTime: 30_000,
  });
}
