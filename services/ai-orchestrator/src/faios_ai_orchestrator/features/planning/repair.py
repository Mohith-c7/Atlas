from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from faios_ai_orchestrator.features.planning.planner import create_mock_plan
from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse
from faios_ai_orchestrator.features.planning.structured_output import (
    StructuredOutputError,
    validate_plan_candidate,
)


@dataclass(frozen=True)
class RepairResult:
    response: PlanResponse
    repaired: bool
    used_fallback: bool
    reason: str | None = None


def repair_or_fallback_plan(candidate: object, request: PlanRequest) -> RepairResult:
    normalized = _normalize_candidate(candidate, request)

    try:
        validated = validate_plan_candidate(normalized, request)
    except StructuredOutputError as exc:
        return RepairResult(
            response=create_mock_plan(request),
            repaired=False,
            used_fallback=True,
            reason=exc.__class__.__name__,
        )

    return RepairResult(
        response=validated.response,
        repaired=normalized is not candidate,
        used_fallback=False,
    )


def _normalize_candidate(candidate: object, request: PlanRequest) -> object:
    if not isinstance(candidate, dict):
        return candidate

    normalized: dict[str, Any] = dict(candidate)
    normalized["commandId"] = normalized.get("commandId") or normalized.get("command_id")
    normalized["commandId"] = normalized["commandId"] or request.command_id

    if "steps" not in normalized or normalized["steps"] is None:
        normalized["steps"] = []

    if "status" not in normalized or normalized["status"] is None:
        normalized["status"] = "failed" if len(normalized["steps"]) == 0 else "awaiting_approval"

    if "summary" not in normalized or normalized["summary"] is None:
        normalized["summary"] = "Prepared a safe execution plan."

    steps = normalized.get("steps")
    if isinstance(steps, list):
        normalized["steps"] = [
            _normalize_step(step) if isinstance(step, dict) else step for step in steps
        ]

    allowed_top_level = {"commandId", "status", "summary", "steps"}
    return {key: value for key, value in normalized.items() if key in allowed_top_level}


def _normalize_step(step: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(step)
    normalized["requiresApproval"] = normalized.get("requiresApproval") or normalized.get(
        "requires_approval"
    )

    if normalized.get("requiresApproval") is None:
        normalized["requiresApproval"] = True

    if "executionPayload" not in normalized and "execution_payload" in normalized:
        normalized["executionPayload"] = normalized.get("execution_payload")

    if normalized.get("provider") == "":
        normalized["provider"] = None

    allowed_step_fields = {
        "capability",
        "provider",
        "requiresApproval",
        "reason",
        "executionPayload",
    }
    return {key: value for key, value in normalized.items() if key in allowed_step_fields}
