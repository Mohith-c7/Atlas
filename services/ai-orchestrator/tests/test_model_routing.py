import pytest

from faios_ai_orchestrator.config import PlannerModelSettings
from faios_ai_orchestrator.features.planning.model_provider import PlannerModelRouter
from faios_ai_orchestrator.features.planning.schemas import PlanRequest


def make_settings(fallback_order: tuple[str, ...]) -> PlannerModelSettings:
    return PlannerModelSettings(
        primary_provider=fallback_order[0],
        fallback_order=fallback_order,
        timeout_seconds=1.0,
        max_retries=0,
        repair_attempts=1,
        openai_model="test-openai",
        anthropic_model="test-anthropic",
        gemini_model="test-gemini",
        openai_api_key=None,
        anthropic_api_key=None,
        gemini_api_key=None,
    )


def make_request() -> PlanRequest:
    return PlanRequest.model_validate(
        {
            "commandId": "cmd_model_route",
            "founderId": "founder_model_route",
            "source": "chat",
            "input": "Create a GitHub issue for activation",
            "correlationId": "corr_model_route",
        }
    )


class EmptyProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> None:
        return None


class CandidateProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object]:
        return {
            "commandId": request.command_id,
            "status": "completed",
            "summary": "Provider generated plan.",
            "steps": [],
        }


@pytest.mark.asyncio
async def test_model_router_uses_ordered_fallback_provider() -> None:
    router = PlannerModelRouter(
        providers={
            "primary": EmptyProvider(),
            "fallback": CandidateProvider(),
        },
        settings=make_settings(("primary", "fallback")),
    )

    result = await router.route(make_request())

    assert result.provider == "fallback"
    assert result.candidate
    assert result.candidate["summary"] == "Provider generated plan."


@pytest.mark.asyncio
async def test_model_router_returns_deterministic_result_when_all_providers_unavailable() -> None:
    router = PlannerModelRouter(
        providers={
            "primary": EmptyProvider(),
        },
        settings=make_settings(("primary",)),
    )

    result = await router.route(make_request())

    assert result.provider == "deterministic"
    assert result.candidate is None
