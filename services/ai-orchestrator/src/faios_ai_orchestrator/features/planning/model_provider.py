from typing import Protocol

from faios_ai_orchestrator.features.planning.schemas import PlanRequest


class PlannerModelProvider(Protocol):
    """Boundary for future GPT, Claude, Gemini, or local model planners."""

    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        """Return a provider-shaped plan candidate, or None when unavailable."""


class UnconfiguredPlannerModelProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        return None
