from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse


class StructuredOutputError(ValueError):
    pass


class StructuredOutputParseError(StructuredOutputError):
    pass


class StructuredOutputValidationError(StructuredOutputError):
    def __init__(self, message: str, validation_error: ValidationError) -> None:
        super().__init__(message)
        self.validation_error = validation_error


@dataclass(frozen=True)
class StructuredPlanCandidate:
    raw: dict[str, Any]
    response: PlanResponse


def parse_json_object(output: str | bytes | bytearray | dict[str, Any]) -> dict[str, Any]:
    if isinstance(output, dict):
        return output

    if isinstance(output, bytes | bytearray):
        output = output.decode("utf-8")

    stripped = _strip_markdown_json_fence(output.strip())
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise StructuredOutputParseError("Planner output is not valid JSON.") from exc

    if not isinstance(parsed, dict):
        raise StructuredOutputParseError("Planner output must be a JSON object.")

    return parsed


def validate_plan_candidate(
    candidate: str | bytes | bytearray | dict[str, Any], request: PlanRequest
) -> StructuredPlanCandidate:
    raw = parse_json_object(candidate)

    try:
        response = PlanResponse.model_validate(raw)
    except ValidationError as exc:
        raise StructuredOutputValidationError(
            "Planner output failed schema validation.", exc
        ) from exc

    if response.command_id != request.command_id:
        raise StructuredOutputParseError(
            "Planner output commandId does not match request commandId."
        )

    return StructuredPlanCandidate(raw=raw, response=response)


def _strip_markdown_json_fence(output: str) -> str:
    if not output.startswith("```"):
        return output

    lines = output.splitlines()
    if len(lines) < 3 or not lines[-1].strip().startswith("```"):
        return output

    first = lines[0].strip().lower()
    if first not in {"```", "```json"}:
        return output

    return "\n".join(lines[1:-1]).strip()
