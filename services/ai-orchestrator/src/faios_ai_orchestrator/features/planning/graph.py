from __future__ import annotations

from typing import NotRequired, TypedDict

from faios_ai_orchestrator.features.planning.approval_policy import (
    attach_capability_context,
    enforce_approval_policy,
)
from faios_ai_orchestrator.features.planning.model_provider import (
    PlannerModelProvider,
    UnconfiguredPlannerModelProvider,
)
from faios_ai_orchestrator.features.planning.planner import create_mock_plan
from faios_ai_orchestrator.features.planning.repair import repair_or_fallback_plan
from faios_ai_orchestrator.features.planning.schemas import PlanRequest, PlanResponse

try:
    from langgraph.graph import END, StateGraph
except ImportError:  # pragma: no cover - exercised when local deps are intentionally minimal.
    END = None
    StateGraph = None


class PlanningState(TypedDict):
    request: PlanRequest
    provider_candidate: NotRequired[dict[str, object] | None]
    response: NotRequired[PlanResponse]


class PlanningGraph:
    def __init__(self, model_provider: PlannerModelProvider | None = None) -> None:
        self._model_provider = model_provider or UnconfiguredPlannerModelProvider()
        self._compiled_graph = self._compile_langgraph()

    async def plan(self, request: PlanRequest) -> PlanResponse:
        if self._compiled_graph is None:
            state = await self._run_sequential_graph({"request": request})
            return state["response"]

        result = await self._compiled_graph.ainvoke({"request": request})
        response = result.get("response")
        if not isinstance(response, PlanResponse):
            return self._fallback_response(request)

        return response

    def _compile_langgraph(self):
        if StateGraph is None or END is None:
            return None

        workflow = StateGraph(PlanningState)
        workflow.add_node("provider_candidate", self._provider_candidate_node)
        workflow.add_node("validate_or_fallback", self._validate_or_fallback_node)
        workflow.add_node("approval_policy", self._approval_policy_node)
        workflow.set_entry_point("provider_candidate")
        workflow.add_edge("provider_candidate", "validate_or_fallback")
        workflow.add_edge("validate_or_fallback", "approval_policy")
        workflow.add_edge("approval_policy", END)
        return workflow.compile()

    async def _run_sequential_graph(self, state: PlanningState) -> PlanningState:
        state = await self._provider_candidate_node(state)
        state = self._validate_or_fallback_node(state)
        return self._approval_policy_node(state)

    async def _provider_candidate_node(self, state: PlanningState) -> PlanningState:
        candidate = await self._model_provider.create_plan_candidate(state["request"])
        return {**state, "provider_candidate": candidate}

    def _validate_or_fallback_node(self, state: PlanningState) -> PlanningState:
        request = state["request"]
        candidate = state.get("provider_candidate")

        if candidate is not None:
            repair_result = repair_or_fallback_plan(candidate, request)
            response = attach_capability_context(
                repair_result.response, request.available_capabilities
            )
            return {**state, "response": response}

        return {**state, "response": self._fallback_response(request)}

    def _approval_policy_node(self, state: PlanningState) -> PlanningState:
        response = state.get("response")
        if response is None:
            response = self._fallback_response(state["request"])

        return {
            **state,
            "response": enforce_approval_policy(state["request"].input, response),
        }

    @staticmethod
    def _fallback_response(request: PlanRequest) -> PlanResponse:
        return attach_capability_context(create_mock_plan(request), request.available_capabilities)
