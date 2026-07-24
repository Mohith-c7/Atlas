from faios_ai_orchestrator.features.planning.schemas import (
    AvailableCapability,
    PlanRequest,
    PlanResponse,
    PlanStep,
)


_CAPABILITY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("calendar.schedule", ("calendar", "meeting", "schedule", "call", "invite")),
    ("communication.send", ("send", "email", "message", "slack", "whatsapp", "notify")),
    ("task.create", ("task", "todo", "follow up", "remind", "assign")),
    ("knowledge.search", ("find", "search", "summarize", "summary", "research")),
    ("repository.createIssue", ("github", "issue", "bug", "repo", "repository")),
)

_HIGH_RISK_KEYWORDS = ("delete", "remove", "cancel", "pay", "purchase", "send", "email", "message")


def create_mock_plan(request: PlanRequest) -> PlanResponse:
    normalized_text = request.input.strip()
    lowered_text = normalized_text.lower()
    capabilities = _select_capabilities(lowered_text, request.available_capabilities)

    if not capabilities:
        return PlanResponse(
            command_id=request.command_id,
            status="failed",
            summary=(
                "Unable to prepare a safe execution plan because no available MCP capability "
                "matches the founder request."
            ),
            steps=[],
        )

    requires_approval = _requires_approval(lowered_text, capabilities)

    steps = _build_steps(capabilities, requires_approval)
    return PlanResponse(
        command_id=request.command_id,
        status="awaiting_approval" if requires_approval else "completed",
        summary=_build_summary(capabilities),
        steps=steps,
    )


def _select_capabilities(
    lowered_text: str, available_capabilities: list[AvailableCapability]
) -> list[AvailableCapability]:
    available = _normalize_available_capabilities(available_capabilities)
    if not available:
        return []

    matched_capabilities = [
        capability_definition
        for capability, keywords in _CAPABILITY_KEYWORDS
        if (capability_definition := available.get(capability))
        and any(keyword in lowered_text for keyword in keywords)
    ]

    if matched_capabilities:
        return matched_capabilities

    if "knowledge.search" in available:
        return [available["knowledge.search"]]

    return []


def _normalize_available_capabilities(
    available_capabilities: list[AvailableCapability],
) -> dict[str, AvailableCapability]:
    return {
        capability.key: capability
        for capability in available_capabilities
        if capability.status == "available"
    }


def _requires_approval(lowered_text: str, capabilities: list[AvailableCapability]) -> bool:
    if any(keyword in lowered_text for keyword in _HIGH_RISK_KEYWORDS):
        return True

    return any(capability.requires_approval for capability in capabilities)


def _build_summary(capabilities: list[AvailableCapability]) -> str:
    capability_phrase = ", ".join(capability.key for capability in capabilities)
    return f"Prepared a mock execution plan using provider-agnostic capabilities: {capability_phrase}."


def _build_steps(
    capabilities: list[AvailableCapability], requires_approval: bool
) -> list[PlanStep]:
    steps = []
    for capability in capabilities:
        steps.append(
            PlanStep(
                capability=capability.key,
                provider=capability.provider,
                requires_approval=requires_approval or capability.requires_approval,
                reason="This phase plans the MCP capability without executing external tools.",
            )
        )

    return steps
