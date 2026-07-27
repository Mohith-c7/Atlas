from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from typing import Any

from faios_ai_orchestrator.features.planning.graph import PlanningGraph
from faios_ai_orchestrator.features.planning.schemas import AvailableCapability, PlanRequest


@dataclass(frozen=True)
class PlannerEvalCase:
    id: str
    input: str
    expected_capabilities: tuple[str, ...]
    expected_status: str
    expected_approval: bool


@dataclass(frozen=True)
class PlannerEvalFailure:
    case_id: str
    reason: str


@dataclass(frozen=True)
class PlannerEvalReport:
    total: int
    passed: int
    failures: tuple[PlannerEvalFailure, ...]

    @property
    def success(self) -> bool:
        return not self.failures


DEFAULT_CAPABILITIES: tuple[AvailableCapability, ...] = (
    AvailableCapability.model_validate(
        {
            "key": "repository.createIssue",
            "provider": "github",
            "label": "Create repository issues",
            "description": "Create GitHub issues.",
            "requiresApproval": True,
            "status": "available",
        }
    ),
    AvailableCapability.model_validate(
        {
            "key": "knowledge.search",
            "provider": "notion",
            "label": "Search knowledge",
            "description": "Search founder knowledge and connected notes.",
            "requiresApproval": False,
            "status": "available",
        }
    ),
    AvailableCapability.model_validate(
        {
            "key": "calendar.schedule",
            "provider": "google-calendar",
            "label": "Schedule calendar events",
            "description": "Schedule calendar events.",
            "requiresApproval": False,
            "status": "available",
        }
    ),
    AvailableCapability.model_validate(
        {
            "key": "communication.send",
            "provider": "gmail",
            "label": "Send communication",
            "description": "Send email or messages.",
            "requiresApproval": True,
            "status": "available",
        }
    ),
)


def load_default_eval_cases() -> tuple[PlannerEvalCase, ...]:
    dataset = (
        resources.files("faios_ai_orchestrator.features.planning.evals")
        .joinpath("planner_regression_v1.json")
        .read_text(encoding="utf-8")
    )
    raw_cases = json.loads(dataset)

    if not isinstance(raw_cases, list):
        raise ValueError("Planner eval dataset must be a JSON array.")

    return tuple(_parse_eval_case(raw_case) for raw_case in raw_cases)


async def run_planner_eval_cases(
    cases: tuple[PlannerEvalCase, ...] | None = None,
    graph: PlanningGraph | None = None,
) -> PlannerEvalReport:
    eval_cases = cases or load_default_eval_cases()
    planning_graph = graph or PlanningGraph()
    failures: list[PlannerEvalFailure] = []

    for case in eval_cases:
        request = _build_request(case)
        response = await planning_graph.plan(request)
        actual_capabilities = tuple(step.capability for step in response.steps)
        actual_approval = any(step.requires_approval for step in response.steps)

        if response.status != case.expected_status:
            failures.append(
                PlannerEvalFailure(
                    case_id=case.id,
                    reason=f"expected status {case.expected_status}, received {response.status}",
                )
            )
            continue

        if actual_capabilities != case.expected_capabilities:
            failures.append(
                PlannerEvalFailure(
                    case_id=case.id,
                    reason=(
                        "expected capabilities "
                        f"{case.expected_capabilities}, received {actual_capabilities}"
                    ),
                )
            )
            continue

        if actual_approval is not case.expected_approval:
            failures.append(
                PlannerEvalFailure(
                    case_id=case.id,
                    reason=(
                        f"expected approval {case.expected_approval}, "
                        f"received {actual_approval}"
                    ),
                )
            )

    return PlannerEvalReport(
        total=len(eval_cases),
        passed=len(eval_cases) - len(failures),
        failures=tuple(failures),
    )


def _parse_eval_case(raw_case: Any) -> PlannerEvalCase:
    if not isinstance(raw_case, dict):
        raise ValueError("Planner eval case must be a JSON object.")

    return PlannerEvalCase(
        id=_required_string(raw_case, "id"),
        input=_required_string(raw_case, "input"),
        expected_capabilities=tuple(_required_string_list(raw_case, "expectedCapabilities")),
        expected_status=_required_string(raw_case, "expectedStatus"),
        expected_approval=_required_bool(raw_case, "expectedApproval"),
    )


def _build_request(case: PlannerEvalCase) -> PlanRequest:
    return PlanRequest(
        command_id=f"eval_{case.id}",
        founder_id="eval_founder",
        source="chat",
        input=case.input,
        correlation_id=f"corr_eval_{case.id}",
        available_capabilities=list(DEFAULT_CAPABILITIES),
    )


def _required_string(raw_case: dict[str, Any], key: str) -> str:
    value = raw_case.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Planner eval case requires string {key}.")

    return value


def _required_bool(raw_case: dict[str, Any], key: str) -> bool:
    value = raw_case.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"Planner eval case requires boolean {key}.")

    return value


def _required_string_list(raw_case: dict[str, Any], key: str) -> list[str]:
    value = raw_case.get(key)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"Planner eval case requires string list {key}.")

    return value
