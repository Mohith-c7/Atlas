import pytest

from faios_ai_orchestrator.features.planning.evals import (
    run_planner_eval_cases,
)
from faios_ai_orchestrator.features.planning.evals.runner import load_default_eval_cases


def test_default_planner_eval_dataset_loads() -> None:
    cases = load_default_eval_cases()

    assert len(cases) >= 4
    assert cases[0].id == "github_issue_creation"


@pytest.mark.asyncio
async def test_default_planner_eval_cases_pass() -> None:
    report = await run_planner_eval_cases()

    assert report.success
    assert report.total == report.passed
    assert report.failures == ()
