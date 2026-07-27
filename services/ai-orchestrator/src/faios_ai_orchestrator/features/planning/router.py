from fastapi import APIRouter

from faios_ai_orchestrator.config import get_settings
from faios_ai_orchestrator.features.planning.graph import PlanningGraph
from faios_ai_orchestrator.features.planning.model_provider import create_planner_model_router
from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse


router = APIRouter(prefix="/internal/v1/commands", tags=["command-planning"])
settings = get_settings()
planning_graph = PlanningGraph(create_planner_model_router(settings.planner))


@router.post("/plan", response_model=PlanResponse)
async def plan_command(request: PlanRequest) -> PlanResponse:
    return await planning_graph.plan(request)
