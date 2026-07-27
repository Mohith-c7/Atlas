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

    steps = _build_steps(capabilities, requires_approval, normalized_text, lowered_text)
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
    capabilities: list[AvailableCapability],
    requires_approval: bool,
    normalized_text: str,
    lowered_text: str,
) -> list[PlanStep]:
    steps = []
    for capability in capabilities:
        steps.append(
            PlanStep(
                capability=capability.key,
                provider=capability.provider,
                requires_approval=requires_approval or capability.requires_approval,
                reason="This phase plans the MCP capability without executing external tools.",
                execution_payload=_build_execution_payload(
                    capability.key, normalized_text, lowered_text
                ),
            )
        )

    return steps


def _build_execution_payload(
    capability_key: str, normalized_text: str, lowered_text: str
) -> dict[str, object] | None:
    if capability_key != "repository.createIssue":
        return None

    title = _build_github_issue_title(normalized_text)
    labels = _build_github_issue_labels(lowered_text)

    payload: dict[str, object] = {
        "title": title,
        "body": (
            "Created from founder command:\n\n"
            f"{normalized_text}\n\n"
            "Review the issue details before assigning or linking it to a project."
        ),
    }

    if labels:
        payload["labels"] = labels

    return payload


def _build_github_issue_title(normalized_text: str) -> str:
    title = normalized_text

    prefixes = (
        "create a github issue for",
        "create github issue for",
        "create an issue for",
        "create issue for",
        "open a github issue for",
        "open github issue for",
        "open an issue for",
        "open issue for",
    )
    lowered_title = title.lower()

    for prefix in prefixes:
        if lowered_title.startswith(prefix):
            title = title[len(prefix) :].strip(" .:-")
            break

    if not title:
        title = normalized_text

    return title[:256]


def _build_github_issue_labels(lowered_text: str) -> list[str]:
    labels = []
    keyword_labels = (
        (("bug", "broken", "error", "fix"), "bug"),
        (("onboarding", "activation"), "onboarding"),
        (("docs", "documentation", "readme"), "documentation"),
        (("integration", "mcp", "provider"), "integration"),
        (("product", "ux", "ui"), "product"),
    )

    for keywords, label in keyword_labels:
        if any(keyword in lowered_text for keyword in keywords):
            labels.append(label)

    return labels
