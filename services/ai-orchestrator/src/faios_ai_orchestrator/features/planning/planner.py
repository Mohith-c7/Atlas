from faios_ai_orchestrator.features.planning.schemas import (
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
    capabilities = _select_capabilities(lowered_text)
    requires_approval = _requires_approval(lowered_text, capabilities)

    steps = _build_steps(capabilities, requires_approval)
    return PlanResponse(
        command_id=request.command_id,
        status="awaiting_approval" if requires_approval else "completed",
        summary=_build_summary(capabilities),
        steps=steps,
    )


def _select_capabilities(lowered_text: str) -> list[str]:
    matched_capabilities = [
        capability
        for capability, keywords in _CAPABILITY_KEYWORDS
        if any(keyword in lowered_text for keyword in keywords)
    ]

    return matched_capabilities or ["knowledge.search"]


def _requires_approval(lowered_text: str, capabilities: list[str]) -> bool:
    if any(keyword in lowered_text for keyword in _HIGH_RISK_KEYWORDS):
        return True

    return any(
        capability in {"calendar.schedule", "communication.send", "repository.createIssue"}
        for capability in capabilities
    )


def _build_summary(capabilities: list[str]) -> str:
    capability_phrase = ", ".join(capabilities)
    return f"Prepared a mock execution plan using provider-agnostic capabilities: {capability_phrase}."


def _build_steps(capabilities: list[str], requires_approval: bool) -> list[PlanStep]:
    steps = []
    for capability in capabilities:
        provider = _default_provider_for(capability)
        steps.append(
            PlanStep(
                capability=capability,
                provider=provider,
                requires_approval=requires_approval,
                reason="This phase plans the MCP capability without executing external tools.",
            )
        )

    return steps


def _default_provider_for(capability: str) -> str | None:
    return {
        "calendar.schedule": "google-calendar",
        "communication.send": "gmail",
        "task.create": "jira",
        "knowledge.search": "notion",
        "repository.createIssue": "github",
    }.get(capability)
