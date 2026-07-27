import pytest

from faios_ai_orchestrator.features.planning.graph import PlanningGraph
from faios_ai_orchestrator.features.planning.schemas import PlanRequest


def make_request(input_text: str) -> PlanRequest:
    return PlanRequest.model_validate(
        {
            "commandId": "cmd_test",
            "founderId": "founder_test",
            "source": "chat",
            "input": input_text,
            "correlationId": "corr_test",
            "availableCapabilities": [
                {
                    "key": "repository.createIssue",
                    "provider": "github",
                    "label": "Create repository issues",
                    "description": "Create GitHub issues.",
                    "requiresApproval": True,
                    "status": "available",
                }
            ],
        }
    )


class CandidateProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object] | None:
        return {
            "commandId": request.command_id,
            "status": "completed",
            "summary": "Create the requested GitHub issue.",
            "steps": [
                {
                    "capability": "repository.createIssue",
                    "provider": "github",
                    "requiresApproval": False,
                    "reason": "The founder asked to create a GitHub issue.",
                    "executionPayload": {
                        "title": "Provider generated issue",
                        "body": "Prepared by structured planner.",
                    },
                }
            ],
        }


class UnavailableProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> None:
        return None


@pytest.mark.asyncio
async def test_planning_graph_uses_deterministic_fallback_when_provider_unavailable() -> None:
    response = await PlanningGraph(UnavailableProvider()).plan(
        make_request("Create a GitHub issue for the onboarding bug")
    )

    assert response.status == "awaiting_approval"
    assert response.steps[0].capability == "repository.createIssue"
    assert response.steps[0].execution_payload
    assert response.steps[0].execution_payload["title"] == "the onboarding bug"


@pytest.mark.asyncio
async def test_planning_graph_enforces_approval_policy_on_provider_candidate() -> None:
    response = await PlanningGraph(CandidateProvider()).plan(
        make_request("Create a GitHub issue for activation")
    )

    assert response.status == "awaiting_approval"
    assert response.steps[0].requires_approval is True
    assert response.steps[0].execution_payload
    assert response.steps[0].execution_payload["title"] == "Provider generated issue"
