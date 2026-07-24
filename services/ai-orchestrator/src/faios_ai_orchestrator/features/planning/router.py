from fastapi import APIRouter

from faios_ai_orchestrator.features.planning.planner import create_mock_plan
from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse


router = APIRouter(prefix="/internal/v1/commands", tags=["command-planning"])


@router.post("/plan", response_model=PlanResponse)
async def plan_command(request: PlanRequest) -> PlanResponse:
    return create_mock_plan(request)
