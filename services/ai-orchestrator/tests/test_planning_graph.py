import pytest

from faios_ai_orchestrator.features.planning.graph import PlanningGraph
from faios_ai_orchestrator.features.planning.schemas import PlanRequest


def make_request(
    input_text: str,
    *,
    source: str = "chat",
    include_repository_status: bool = True,
) -> PlanRequest:
    available_capabilities = [
        {
            "key": "repository.createIssue",
            "provider": "github",
            "label": "Create repository issues",
            "description": "Create GitHub issues.",
            "requiresApproval": True,
            "status": "available",
        }
    ]

    if include_repository_status:
        available_capabilities.append(
            {
                "key": "repository.summarizeStatus",
                "provider": "github",
                "label": "Summarize repository status",
                "description": "Summarize GitHub repository status.",
                "requiresApproval": False,
                "status": "available",
            }
        )

    return PlanRequest.model_validate(
        {
            "commandId": "cmd_test",
            "founderId": "founder_test",
            "source": source,
            "input": input_text,
            "correlationId": "corr_test",
            "availableCapabilities": available_capabilities,
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


class InvalidCandidateProvider:
    async def create_plan_candidate(self, request: PlanRequest) -> dict[str, object]:
        return {
            "commandId": request.command_id,
            "status": "completed",
            "summary": "",
            "steps": [],
        }


@pytest.mark.asyncio
async def test_planning_graph_uses_deterministic_fallback_when_provider_unavailable() -> None:
    response = await PlanningGraph(UnavailableProvider()).plan(
        make_request("Create a GitHub issue for the onboarding bug", source="voice")
    )

    assert response.status == "awaiting_approval"
    assert response.steps[0].capability == "repository.createIssue"
    assert response.steps[0].execution_payload
    assert response.steps[0].execution_payload["title"] == "the onboarding bug"


@pytest.mark.asyncio
async def test_planning_graph_selects_github_repository_status_workflow() -> None:
    response = await PlanningGraph(UnavailableProvider()).plan(
        make_request("Summarize GitHub repo status")
    )

    assert response.status == "completed"
    assert response.steps[0].capability == "repository.summarizeStatus"
    assert response.steps[0].requires_approval is False
    assert response.steps[0].execution_payload == {
        "includeIssues": True,
        "includePullRequests": True,
        "itemLimit": 5,
    }


@pytest.mark.asyncio
async def test_planning_graph_keeps_repo_bug_summary_read_only() -> None:
    response = await PlanningGraph(UnavailableProvider()).plan(
        make_request("Summarize repo bugs and open issues")
    )

    assert response.status == "completed"
    assert len(response.steps) == 1
    assert response.steps[0].capability == "repository.summarizeStatus"
    assert response.steps[0].requires_approval is False


@pytest.mark.asyncio
async def test_planning_graph_does_not_create_issue_when_status_capability_unavailable() -> None:
    response = await PlanningGraph(UnavailableProvider()).plan(
        make_request(
            "Summarize repo bugs and open issues",
            include_repository_status=False,
        )
    )

    assert response.status == "failed"
    assert response.steps == []


@pytest.mark.asyncio
async def test_planning_graph_enforces_approval_policy_on_provider_candidate() -> None:
    response = await PlanningGraph(CandidateProvider()).plan(
        make_request("Create a GitHub issue for activation")
    )

    assert response.status == "awaiting_approval"
    assert response.steps[0].requires_approval is True
    assert response.steps[0].execution_payload
    assert response.steps[0].execution_payload["title"] == "Provider generated issue"


@pytest.mark.asyncio
async def test_planning_graph_falls_back_when_provider_candidate_is_invalid() -> None:
    response = await PlanningGraph(InvalidCandidateProvider()).plan(
        make_request("Create a GitHub issue for the onboarding bug")
    )

    assert response.status == "awaiting_approval"
    assert response.steps[0].capability == "repository.createIssue"
    assert response.steps[0].execution_payload
    assert response.steps[0].execution_payload["title"] == "the onboarding bug"
