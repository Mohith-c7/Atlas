from faios_ai_orchestrator.features.planning.schemas import AvailableCapability, PlanResponse


HIGH_RISK_KEYWORDS = ("delete", "remove", "cancel", "pay", "purchase", "send", "email", "message")


def enforce_approval_policy(request_input: str, response: PlanResponse) -> PlanResponse:
    available_capabilities = {
        capability.key: capability for capability in response.steps_capability_context
    }
    requires_founder_approval = any(
        keyword in request_input.lower() for keyword in HIGH_RISK_KEYWORDS
    )

    normalized_steps = []
    for step in response.steps:
        capability = available_capabilities.get(step.capability)
        step_requires_approval = (
            requires_founder_approval
            or step.requires_approval
            or bool(capability and capability.requires_approval)
        )
        normalized_steps.append(
            step.model_copy(update={"requires_approval": step_requires_approval})
        )

    status = response.status
    if normalized_steps and any(step.requires_approval for step in normalized_steps):
        status = "awaiting_approval"

    return response.model_copy(update={"status": status, "steps": normalized_steps})


def attach_capability_context(
    response: PlanResponse, capabilities: list[AvailableCapability]
) -> PlanResponse:
    return response.model_copy(update={"steps_capability_context": capabilities})
