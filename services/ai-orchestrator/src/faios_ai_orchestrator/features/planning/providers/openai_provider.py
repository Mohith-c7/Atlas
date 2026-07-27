from typing import Any

from faios_ai_orchestrator.features.planning.providers.base import BasePlannerProvider

try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover - optional dependency boundary
    AsyncOpenAI = None  # type: ignore[assignment]


class OpenAIPlannerProvider(BasePlannerProvider):
    provider = "openai"

    def __init__(
        self,
        *,
        model: str = "gpt-5",
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
            AsyncOpenAI(api_key=api_key) if client is None and api_key and AsyncOpenAI else None
        )

    def provider_label(self) -> str:
        return "OpenAI"
