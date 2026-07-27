from typing import Any

from faios_ai_orchestrator.features.planning.providers.base import BasePlannerProvider

try:
    from anthropic import AsyncAnthropic
except ImportError:  # pragma: no cover - optional dependency boundary
    AsyncAnthropic = None  # type: ignore[assignment]


class AnthropicPlannerProvider(BasePlannerProvider):
    provider = "anthropic"

    def __init__(
        self,
        *,
        model: str = "claude-sonnet-4-5",
        api_key: str | None = None,
        client: Any | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        super().__init__(
            model=model,
            api_key=api_key,
            client=client,
            timeout_seconds=timeout_seconds,
        )
        self.sdk_client = (
            AsyncAnthropic(api_key=api_key)
            if client is None and api_key and AsyncAnthropic
            else None
        )

    def provider_label(self) -> str:
        return "Anthropic"
