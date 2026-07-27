from fastapi import APIRouter

from faios_ai_orchestrator.features.planning.graph import PlanningGraph
from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse


router = APIRouter(prefix="/internal/v1/commands", tags=["command-planning"])
planning_graph = PlanningGraph()


@router.post("/plan", response_model=PlanResponse)
async def plan_command(request: PlanRequest) -> PlanResponse:
    return await planning_graph.plan(request)
