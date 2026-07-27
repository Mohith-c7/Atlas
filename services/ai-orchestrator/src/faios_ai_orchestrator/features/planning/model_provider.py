from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from faios_ai_orchestrator.config import PlannerModelSettings
from faios_ai_orchestrator.features.planning.prompts import get_planner_prompt
from faios_ai_orchestrator.features.planning.providers import (
    AnthropicPlannerProvider,
    GeminiPlannerProvider,
    OpenAIPlannerProvider,
)
from faios_ai_orchestrator.features.planning.schemas import PlanRequest


class PlannerModelProvider(Protocol):
    """Boundary for future GPT, Claude, Gemini, or local model planners."""

    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        """Return a provider-shaped plan candidate, or None when unavailable."""


class UnconfiguredPlannerModelProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        return None


@dataclass(frozen=True)
class PlannerModelRouteResult:
    provider: str
    candidate: dict[str, object] | None
    error: str | None = None


class PlannerModelRouter:
    def __init__(
        self,
        providers: dict[str, PlannerModelProvider],
        settings: PlannerModelSettings,
        system_prompt: str = "",
    ) -> None:
        self._providers = providers
        self._settings = settings
        self._system_prompt = system_prompt

    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        route_result = await self.route(request)
        return route_result.candidate

    async def route(self, request: PlanRequest) -> PlannerModelRouteResult:
        last_error: str | None = None

        for provider_name in self._settings.fallback_order:
            provider = self._providers.get(provider_name)
            if provider is None:
                continue

            for _attempt in range(self._settings.max_retries + 1):
                try:
                    candidate = await asyncio.wait_for(
                        self._create_candidate(provider, request),
                        timeout=self._settings.timeout_seconds,
                    )
                except TimeoutError:
                    last_error = f"{provider_name} planner timed out."
                    continue
                except Exception as error:  # pragma: no cover - provider-specific clients vary.
                    last_error = str(error)
                    continue

                if candidate is not None:
                    return PlannerModelRouteResult(provider=provider_name, candidate=candidate)

                last_error = f"{provider_name} planner returned no candidate."

        return PlannerModelRouteResult(provider="deterministic", candidate=None, error=last_error)

    async def _create_candidate(
        self, provider: PlannerModelProvider, request: PlanRequest
    ) -> dict[str, object] | None:
        try:
            return await provider.create_plan_candidate(  # type: ignore[call-arg]
                request,
                system_prompt=self._system_prompt,
            )
        except TypeError:
            return await provider.create_plan_candidate(request)


def create_planner_model_router(settings: PlannerModelSettings) -> PlannerModelRouter:
    prompt = get_planner_prompt()

    return PlannerModelRouter(
        providers={
            "openai": OpenAIPlannerProvider(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
                timeout_seconds=settings.timeout_seconds,
            ),
            "anthropic": AnthropicPlannerProvider(
                model=settings.anthropic_model,
                api_key=settings.anthropic_api_key,
                timeout_seconds=settings.timeout_seconds,
            ),
            "gemini": GeminiPlannerProvider(
                model=settings.gemini_model,
                api_key=settings.gemini_api_key,
                timeout_seconds=settings.timeout_seconds,
            ),
            "deterministic": UnconfiguredPlannerModelProvider(),
        },
        settings=settings,
        system_prompt=prompt.text,
    )
